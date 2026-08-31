import { subtypeOf } from "~/lib/graph/parent-links"
import {
  definitelyBefore,
  maximumYearsBetween,
  minimumYearsBetween,
} from "~/lib/partial-date"
import { personDisplayName } from "~/lib/person-name"
import type { Person, Relationship, TreeMember } from "~/lib/types"

export type Severity = "error" | "warning"

export type FindingCode =
  | "death-before-birth"
  | "child-born-before-parent"
  | "parent-too-young"
  | "child-born-after-parent-death"
  | "marriage-before-birth"
  | "marriage-after-death"
  | "implausible-lifespan"
  | "unresolved-placeholder"
  | "not-in-any-tree"
  | "missing-birth-year"

export interface Finding {
  code: FindingCode
  severity: Severity
  message: string
  // The person the reader should be taken to first, followed by anyone else
  // the finding is about.
  personIds: string[]
}

export interface ValidateInput {
  people: Person[]
  relationships: Relationship[]
  memberships: TreeMember[]
}

// The youngest a biological parent is taken to plausibly be. Low on purpose:
// the rule exists to catch a mistyped year, not to judge anybody.
const MIN_BIOLOGICAL_PARENT_AGE = 12

// A father can die before his child is born; nine months is the window that
// makes that legitimate. Every other kind of parent has to be alive after the
// birth to have become a parent at all, so their window is zero.
const POSTHUMOUS_BIRTH_WINDOW_YEARS = 0.75

const MAX_PLAUSIBLE_LIFESPAN_YEARS = 120

// Subtypes where the parent may legitimately be younger than the child — a
// step-parent marries in, a guardian is appointed, and neither implies seniority.
const MAY_BE_YOUNGER_THAN_CHILD = new Set(["step", "guardian"])

// Reports contradictions and gaps in the whole person pool.
//
// Pure and dependency-free so every rule is unit-testable on fixtures, in the
// spirit of computeGenerations. Scoped to the pool rather than one tree, both
// because "belongs to no tree" is only meaningful pool-wide and to match D14's
// precedent that whole-pool is the unit for anything that isn't drawing.
//
// The governing rule for every date comparison here: only report what the data
// definitely says. Partial dates denote spans, so wherever two spans overlap the
// answer is unknown and nothing is reported. A false accusation about someone's
// family is far more damaging than a missed one, and the reader has no way to
// tell the two apart.
export function validate({
  people,
  relationships,
  memberships,
}: ValidateInput): Finding[] {
  const findings: Finding[] = []
  const peopleById = new Map(people.map((person) => [person.id, person]))
  const name = (id: string): string => {
    const person = peopleById.get(id)
    return person ? personDisplayName(person) : "Unknown person"
  }

  const inSomeTree = new Set(memberships.map((m) => m.personId))

  for (const person of people) {
    if (definitelyBefore(person.death, person.birth)) {
      findings.push({
        code: "death-before-birth",
        severity: "error",
        message: `${personDisplayName(person)} died before they were born.`,
        personIds: [person.id],
      })
    }

    const lifespan = minimumYearsBetween(person.birth, person.death)
    if (lifespan !== undefined && lifespan > MAX_PLAUSIBLE_LIFESPAN_YEARS) {
      findings.push({
        code: "implausible-lifespan",
        severity: "warning",
        message: `${personDisplayName(person)} would have lived over ${MAX_PLAUSIBLE_LIFESPAN_YEARS} years.`,
        personIds: [person.id],
      })
    }

    if (person.isPlaceholder) {
      findings.push({
        code: "unresolved-placeholder",
        severity: "warning",
        message: `${personDisplayName(person)} is still a placeholder.`,
        personIds: [person.id],
      })
    }

    if (!inSomeTree.has(person.id)) {
      findings.push({
        code: "not-in-any-tree",
        severity: "warning",
        message: `${personDisplayName(person)} belongs to no tree, so they appear on no canvas.`,
        personIds: [person.id],
      })
    }

    if (person.birth?.year === undefined && !person.isPlaceholder) {
      findings.push({
        code: "missing-birth-year",
        severity: "warning",
        message: `${personDisplayName(person)} has no birth year recorded.`,
        personIds: [person.id],
      })
    }
  }

  for (const relationship of relationships) {
    if (relationship.type === "parent-child") {
      checkParentChild(relationship)
    } else {
      checkMarriage(relationship)
    }
  }

  function checkParentChild(relationship: Relationship): void {
    const parent = peopleById.get(relationship.from)
    const child = peopleById.get(relationship.to)
    if (!parent || !child) return

    const subtype = subtypeOf(relationship)
    const biological = subtype === "biological"
    const ids = [child.id, parent.id]

    // A step-parent or guardian can legitimately be younger than the child, so
    // only the orderings that are impossible for *this* kind of link are
    // reported. Where the child predates the parent, that already covers the
    // too-young case — reporting both would be two findings for one mistake.
    if (
      !MAY_BE_YOUNGER_THAN_CHILD.has(subtype) &&
      definitelyBefore(child.birth, parent.birth)
    ) {
      findings.push({
        code: "child-born-before-parent",
        severity: "error",
        message: `${name(child.id)} was born before their parent ${name(parent.id)}.`,
        personIds: ids,
      })
    } else if (biological) {
      const oldestGap = maximumYearsBetween(parent.birth, child.birth)
      if (oldestGap !== undefined && oldestGap < MIN_BIOLOGICAL_PARENT_AGE) {
        findings.push({
          code: "parent-too-young",
          severity: "error",
          message: `${name(parent.id)} would have been under ${MIN_BIOLOGICAL_PARENT_AGE} when ${name(child.id)} was born.`,
          personIds: [parent.id, child.id],
        })
      }
    }

    const window = biological ? POSTHUMOUS_BIRTH_WINDOW_YEARS : 0
    const gapAfterDeath = minimumYearsBetween(parent.death, child.birth)
    if (gapAfterDeath !== undefined && gapAfterDeath > window) {
      findings.push({
        code: "child-born-after-parent-death",
        severity: "error",
        message: biological
          ? `${name(child.id)} was born more than nine months after their parent ${name(parent.id)} died.`
          : `${name(parent.id)} died before ${name(child.id)} was born, so they cannot be a ${subtype} parent.`,
        personIds: ids,
      })
    }
  }

  function checkMarriage(relationship: Relationship): void {
    if (!relationship.start) return
    // Both ends must be real people, matching checkParentChild. A relationship
    // pointing at somebody who isn't in the pool is itself malformed, and half
    // a record is not a sound basis for telling the user a date is wrong.
    if (
      !peopleById.has(relationship.from) ||
      !peopleById.has(relationship.to)
    ) {
      return
    }

    for (const spouseId of [relationship.from, relationship.to]) {
      const spouse = peopleById.get(spouseId)
      if (!spouse) continue
      const otherId =
        spouseId === relationship.from ? relationship.to : relationship.from

      if (definitelyBefore(relationship.start, spouse.birth)) {
        findings.push({
          code: "marriage-before-birth",
          severity: "error",
          message: `${name(spouseId)} was married to ${name(otherId)} before they were born.`,
          personIds: [spouseId, otherId],
        })
      }
      if (definitelyBefore(spouse.death, relationship.start)) {
        findings.push({
          code: "marriage-after-death",
          severity: "error",
          message: `${name(spouseId)} was married to ${name(otherId)} after they died.`,
          personIds: [spouseId, otherId],
        })
      }
    }
  }

  // Errors first, then a stable order within each severity so the list doesn't
  // reshuffle under the reader between recomputes.
  return findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1
    return a.code.localeCompare(b.code) || a.message.localeCompare(b.message)
  })
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return {
    error: findings.filter((f) => f.severity === "error").length,
    warning: findings.filter((f) => f.severity === "warning").length,
  }
}
