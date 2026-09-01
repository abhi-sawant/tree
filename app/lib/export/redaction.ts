import { definitelyBefore } from "~/lib/partial-date"
import { photoFieldsFor } from "~/lib/person-photos"
import type { PartialDate, Person, Relationship } from "~/lib/types"

// Hides the details of people who are probably still alive, for the files that
// leave this machine: the GEDCOM, the family book and the canvas image. These
// get emailed around and posted to forums, and a full name with a date of birth
// is the raw material of identity theft — which is why every serious genealogy
// tool does this and why doing it is standard practice rather than caution.
//
// **This inverts the Phase 1 validator rule.** A finding must never fire on an
// undecidable comparison, because a false accusation about someone's family is
// worse than a missed one. Here the asymmetry runs the other way: wrongly
// hiding a dead person's dates costs a reader one lookup, while wrongly
// publishing a living person's costs them something they cannot take back. So
// everything undecidable resolves to *redact*, including a person with no dates
// recorded at all. The count is always reported before the export so that
// aggressiveness is visible rather than surprising.

// After this long, someone with no recorded death is presumed to have died. A
// round century rather than a demographic estimate: this is a privacy cut-off,
// and picking 87 or 93 would imply a precision the question doesn't have.
export const PRESUMED_LIFESPAN_YEARS = 100

// What a redacted person is called. The surname is kept — see redactPerson.
export const REDACTED_GIVEN_NAME = "Living"

export interface RedactionOptions {
  now?: Date
  presumedLifespanYears?: number
}

function cutoffDate(options: RedactionOptions = {}): PartialDate {
  const { now = new Date(), presumedLifespanYears = PRESUMED_LIFESPAN_YEARS } =
    options
  return {
    year: now.getFullYear() - presumedLifespanYears,
    month: now.getMonth() + 1,
    day: now.getDate(),
  }
}

export function isPresumedLiving(
  person: Pick<Person, "birth" | "death">,
  options: RedactionOptions = {}
): boolean {
  // A recorded death settles it. A year is required: a PartialDate with no year
  // renders empty and reads as unknown everywhere else in the app, so treating
  // one as proof of death would let an accidental keystroke unredact somebody.
  if (person.death?.year !== undefined) return false

  // definitelyBefore, not a plain year subtraction — it works in spans, so
  // "c. 1926" (which could mean 1928) stays redacted while "1920" does not.
  // The span-aware helper happens to fail in the safe direction here, which is
  // the opposite of why the validator uses it, but the same reasoning: never
  // decide on an overlap.
  return !definitelyBefore(person.birth, cutoffDate(options))
}

// Keeps: the surname, sex, and everything structural (id, timestamps,
// placeholder flag, multiple-birth token).
//
// Drops: given name, nickname, maiden name, both dates, notes, custom fields
// and every photo.
//
// The surname is kept deliberately. Hiding it would leave a chart of twenty
// identical "Living" cards that nobody can read, and it protects almost
// nothing: the file is a family tree, so the surnames in it are stated by the
// document's own existence. Sex is kept because it is what orders HUSB/WIFE in
// a GEDCOM FAM, and a redacted export that silently reshuffled spouses would be
// wrong about the family rather than merely quiet about it.
export function redactPerson(person: Person): Person {
  return {
    ...person,
    givenName: REDACTED_GIVEN_NAME,
    maidenName: undefined,
    nickname: undefined,
    birth: undefined,
    death: undefined,
    notes: undefined,
    customFields: undefined,
    ...photoFieldsFor([]),
  }
}

export interface RedactedPool {
  people: Person[]
  relationships: Relationship[]
  redactedIds: Set<string>
}

// Relationship dates go too, whenever either end is redacted. A hidden birth
// date beside a visible wedding date is not privacy — it is the same
// information arriving a different way, and it dates the couple to within a
// few years.
export function redactPool(
  people: Person[],
  relationships: Relationship[],
  options: RedactionOptions = {}
): RedactedPool {
  const redactedIds = new Set(
    people
      .filter((person) => isPresumedLiving(person, options))
      .map((person) => person.id)
  )

  if (redactedIds.size === 0) {
    return { people, relationships, redactedIds }
  }

  return {
    people: people.map((person) =>
      redactedIds.has(person.id) ? redactPerson(person) : person
    ),
    relationships: relationships.map((relationship) =>
      redactedIds.has(relationship.from) || redactedIds.has(relationship.to)
        ? { ...relationship, start: undefined, end: undefined }
        : relationship
    ),
    redactedIds,
  }
}

export function countPresumedLiving(
  people: Person[],
  options: RedactionOptions = {}
): number {
  return people.filter((person) => isPresumedLiving(person, options)).length
}

// Printed on the family book's title page and offered as a line in the UI, so
// nobody mistakes a run of "Living" entries for missing records.
export function redactionNote(count: number): string {
  return count === 1
    ? "1 person who may still be living has had their details withheld."
    : `${count} people who may still be living have had their details withheld.`
}
