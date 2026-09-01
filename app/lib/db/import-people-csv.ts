// Applying a people CSV to the database.
//
// Additive, never destructive: rows create new people or update ones matched by
// id, and links are only ever added. Nothing is deleted and no existing
// relationship is rewritten, which is what makes it safe for CSV to carry less
// than the model does — a round-trip through a spreadsheet cannot turn an
// adopted link biological, because it never touches a link that already exists.
//
// This is deliberately unlike importBackup, which replaces everything: a
// backup file is a complete picture of a database and a spreadsheet is a
// fragment of one.

import { db } from "~/lib/db/db"
import { createPerson, updatePerson } from "~/lib/db/people"
import {
  RelationshipCycleError,
  SelfReferenceError,
  TooManyParentsError,
  addRelationship,
} from "~/lib/db/relationships"
import { addPersonToTree } from "~/lib/db/trees"
import { parsePeopleCsv, type ParsedPersonRow } from "~/lib/export/people-csv"
import { personDisplayName } from "~/lib/person-name"
import type { Person } from "~/lib/types"

export interface CsvImportSummary {
  created: number
  updated: number
  linksAdded: number
  // Everything that could not be done, each naming the row it came from. A
  // count of successes with no account of the rest would let a mistyped parent
  // name vanish silently, which is the failure this format is most prone to.
  problems: string[]
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

// Both the name as displayed (which includes a quoted nickname, since that is
// what the export writes) and the plain given+family form, because a person's
// own spreadsheet will have the plain one.
function nameKeysFor(person: Person): string[] {
  const keys = [personDisplayName(person)]
  const plain = [person.givenName, person.familyName].filter(Boolean).join(" ")
  keys.push(plain)
  return [...new Set(keys.map(normalizeName))].filter(Boolean)
}

class NameIndex {
  private byName = new Map<string, string[]>()
  private byId = new Map<string, Person>()

  add(person: Person): void {
    this.byId.set(person.id, person)
    for (const key of nameKeysFor(person)) {
      this.byName.set(key, [...(this.byName.get(key) ?? []), person.id])
    }
  }

  // "not found" and "several people have that name" are different answers and
  // the reader needs to know which: one is a typo, the other needs a
  // disambiguation they have to make themselves.
  resolve(
    reference: string
  ): { ok: true; id: string } | { ok: false; reason: "missing" | "ambiguous" } {
    const trimmed = reference.trim()
    if (this.byId.has(trimmed)) return { ok: true, id: trimmed }

    const matches = this.byName.get(normalizeName(trimmed)) ?? []
    if (matches.length === 1) return { ok: true, id: matches[0] }
    if (matches.length === 0) return { ok: false, reason: "missing" }
    return { ok: false, reason: "ambiguous" }
  }
}

function personFieldsOf(row: ParsedPersonRow) {
  return {
    givenName: row.givenName,
    familyName: row.familyName,
    maidenName: row.maidenName,
    nickname: row.nickname,
    sex: row.sex,
    birth: row.birth,
    death: row.death,
    notes: row.notes,
  }
}

export interface ImportPeopleCsvOptions {
  // Newly created people join this tree. Without it they exist in the pool but
  // appear on no canvas, which reads as the import having done nothing.
  treeId?: string
}

export async function importPeopleCsv(
  text: string,
  options: ImportPeopleCsvOptions = {}
): Promise<CsvImportSummary> {
  const { rows, problems: parseProblems } = parsePeopleCsv(text)
  const problems = [...parseProblems]

  return db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      const index = new NameIndex()
      for (const existing of await db.people.toArray()) index.add(existing)

      let created = 0
      let updated = 0

      // Everyone first, so a row can reference a parent listed below it — a
      // spreadsheet is not sorted in dependency order and shouldn't have to be.
      const personIdByRow = new Map<number, string>()
      for (const row of rows) {
        const existing = row.id ? await db.people.get(row.id) : undefined
        if (existing) {
          const person = await updatePerson(existing.id, personFieldsOf(row))
          index.add(person)
          personIdByRow.set(row.lineNumber, person.id)
          updated++
        } else {
          // A row carrying an id that isn't in this database is treated as new
          // rather than refused: that is what a CSV exported from another
          // browser looks like.
          const person = await createPerson(personFieldsOf(row))
          index.add(person)
          personIdByRow.set(row.lineNumber, person.id)
          created++
        }
        if (options.treeId) {
          await addPersonToTree(
            options.treeId,
            personIdByRow.get(row.lineNumber)!
          )
        }
      }

      // Keyed by type *and*, for a parent link, by direction. Deduping a
      // parent link in both directions would read "B is A's parent" as a
      // duplicate of "A is B's parent" and skip it silently — when it is
      // actually a contradiction, and one addRelationship refuses as a cycle.
      // A marriage has no direction, so its key is the sorted pair.
      const linkKey = (
        kind: "parent" | "spouse",
        from: string,
        to: string
      ): string =>
        kind === "parent"
          ? `pc:${from}|${to}`
          : `sp:${[from, to].sort().join("|")}`

      const existingLinks = new Set(
        (await db.relationships.toArray()).map((r) =>
          r.type === "parent-child"
            ? linkKey("parent", r.from, r.to)
            : linkKey("spouse", r.from, r.to)
        )
      )

      let linksAdded = 0
      const addLink = async (
        row: ParsedPersonRow,
        reference: string,
        kind: "parent" | "spouse"
      ) => {
        const personId = personIdByRow.get(row.lineNumber)!
        const resolved = index.resolve(reference)
        if (!resolved.ok) {
          problems.push(
            resolved.reason === "missing"
              ? `Row ${row.lineNumber}: no one called "${reference}" — that ${kind} link was skipped.`
              : `Row ${row.lineNumber}: more than one person is called "${reference}" — that ${kind} link was skipped.`
          )
          return
        }

        // Already recorded. Re-adding would write a duplicate row, and
        // re-importing the same sheet must be a no-op.
        const key =
          kind === "parent"
            ? linkKey("parent", resolved.id, personId)
            : linkKey("spouse", personId, resolved.id)
        if (existingLinks.has(key)) return

        try {
          await addRelationship(
            kind === "parent"
              ? { type: "parent-child", from: resolved.id, to: personId }
              : { type: "spouse", from: personId, to: resolved.id }
          )
          existingLinks.add(key)
          linksAdded++
        } catch (error) {
          // These are refusals about this one link, not failures of the
          // import. Reporting and carrying on beats discarding a hundred good
          // rows over one bad reference — but every one of them is reported.
          if (error instanceof TooManyParentsError) {
            problems.push(
              `Row ${row.lineNumber}: ${row.givenName} already has 2 parents — "${reference}" was skipped.`
            )
          } else if (error instanceof RelationshipCycleError) {
            problems.push(
              `Row ${row.lineNumber}: linking "${reference}" would create a cycle — skipped.`
            )
          } else if (error instanceof SelfReferenceError) {
            problems.push(
              `Row ${row.lineNumber}: ${row.givenName} is listed as their own ${kind} — skipped.`
            )
          } else {
            throw error
          }
        }
      }

      for (const row of rows) {
        for (const reference of row.parentRefs) {
          await addLink(row, reference, "parent")
        }
        for (const reference of row.spouseRefs) {
          await addLink(row, reference, "spouse")
        }
      }

      return { created, updated, linksAdded, problems }
    }
  )
}
