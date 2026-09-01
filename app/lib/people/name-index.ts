// Resolving a written name to a person.
//
// Shared by the CSV importer (which resolves a "Parent 1" cell) and by the
// [[wiki links]] in notes. Both are the same question asked of the same pool,
// and two implementations would drift into disagreeing about whether a
// nickname counts or whether case matters — which would show up as a link that
// works in one place and not the other.

import { personDisplayName } from "~/lib/person-name"
import type { Person } from "~/lib/types"

export type NameResolution =
  | { ok: true; id: string }
  // Two different answers, because they need two different responses from the
  // reader: "missing" is a typo to fix, "ambiguous" is a choice only they can
  // make. Collapsing them into "not found" would send someone hunting for a
  // spelling mistake that isn't there.
  | { ok: false; reason: "missing" | "ambiguous"; matches: string[] }

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

// Both the name as displayed — which includes a quoted nickname, since that is
// what the CSV export writes — and the plain given+family form, which is what
// somebody typing a link or filling in a spreadsheet will use.
function nameKeysFor(person: Person): string[] {
  const plain = [person.givenName, person.familyName].filter(Boolean).join(" ")
  return [
    ...new Set([personDisplayName(person), plain].map(normalizeName)),
  ].filter(Boolean)
}

export class NameIndex {
  private byName = new Map<string, string[]>()
  private ids = new Set<string>()

  constructor(people: Iterable<Person> = []) {
    for (const person of people) this.add(person)
  }

  add(person: Person): void {
    this.ids.add(person.id)
    for (const key of nameKeysFor(person)) {
      const existing = this.byName.get(key) ?? []
      if (!existing.includes(person.id)) {
        this.byName.set(key, [...existing, person.id])
      }
    }
  }

  resolve(reference: string): NameResolution {
    const trimmed = reference.trim()
    // An exact id wins outright. The CSV carries ids, and a person whose name
    // happens to collide with someone else's must still resolve to themselves.
    if (this.ids.has(trimmed)) return { ok: true, id: trimmed }

    const matches = this.byName.get(normalizeName(trimmed)) ?? []
    if (matches.length === 1) return { ok: true, id: matches[0] }
    if (matches.length === 0) return { ok: false, reason: "missing", matches }
    return { ok: false, reason: "ambiguous", matches }
  }
}
