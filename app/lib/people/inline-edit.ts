import { formatPartialDate } from "~/lib/partial-date"
import type { PartialDate, Person } from "~/lib/types"

// The cells the People table lets you edit in place. Deliberately the four
// single-value fields the table already shows — the rest of a person (sex,
// nickname, custom fields, photo) still goes through the form, which has room
// to label them.
export type InlineField = "givenName" | "familyName" | "birthYear" | "deathYear"

export type InlinePatch = Partial<
  Pick<Person, "givenName" | "familyName" | "birth" | "death">
>

export type InlineEditResult =
  { ok: true; patch: InlinePatch } | { ok: false; message: string }

// What the editor opens with. A date cell edits its *year* only, so the field
// starts on the year even when the cell was displaying a full date — the
// month and day are carried through untouched (see applyInlineEdit), which is
// the whole reason a year-only editor is safe to offer here.
export function inlineEditValue(person: Person, field: InlineField): string {
  switch (field) {
    case "givenName":
      return person.givenName
    case "familyName":
      return person.familyName ?? ""
    case "birthYear":
      return person.birth?.year === undefined ? "" : String(person.birth.year)
    case "deathYear":
      return person.death?.year === undefined ? "" : String(person.death.year)
  }
}

// What the cell shows when it isn't being edited.
export function inlineDisplayValue(person: Person, field: InlineField): string {
  switch (field) {
    case "givenName":
      return person.givenName
    case "familyName":
      return person.familyName ?? ""
    case "birthYear":
      return formatPartialDate(person.birth)
    case "deathYear":
      return formatPartialDate(person.death)
  }
}

// A year outside this range is a typo — a mistyped "19990", or a stray digit —
// far more often than it is a real date. Wide enough to hold any date a family
// record plausibly carries, including a BC one.
const MIN_YEAR = -4000
const MAX_YEAR = 9999

function applyYear(
  existing: PartialDate | undefined,
  raw: string
):
  | { ok: true; value: PartialDate | undefined }
  | { ok: false; message: string } {
  const trimmed = raw.trim()
  // Clearing the year clears the whole date. A PartialDate with a month and no
  // year denotes nothing — formatPartialDate renders it as empty and every
  // comparison in partial-date.ts treats it as unknown — so keeping the month
  // behind an emptied cell would store a value that reads as absent everywhere
  // and would silently come back if a year were typed in later.
  if (trimmed === "") return { ok: true, value: undefined }

  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, message: "Enter a year as digits, e.g. 1912." }
  }
  const year = Number.parseInt(trimmed, 10)
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return {
      ok: false,
      message: `Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`,
    }
  }

  // Month, day and the approximate flag are carried forward: editing the year
  // of "c. 3 May 1890" must not quietly throw away the day or turn a circa date
  // into an exact one.
  return { ok: true, value: { ...existing, year } }
}

export function applyInlineEdit(
  person: Person,
  field: InlineField,
  raw: string
): InlineEditResult {
  if (field === "givenName") {
    const givenName = raw.trim()
    // PersonFormSchema requires a given name, so an empty one would fail the
    // parse inside updatePerson with a schema message rather than something a
    // reader can act on.
    if (givenName === "") {
      return { ok: false, message: "A given name is required." }
    }
    return { ok: true, patch: { givenName } }
  }

  if (field === "familyName") {
    const familyName = raw.trim()
    // Stored absent rather than as "", so a cleared family name matches every
    // person who never had one recorded.
    return { ok: true, patch: { familyName: familyName || undefined } }
  }

  const isBirth = field === "birthYear"
  const result = applyYear(isBirth ? person.birth : person.death, raw)
  if (!result.ok) return result
  return {
    ok: true,
    patch: isBirth ? { birth: result.value } : { death: result.value },
  }
}

// True when the edit would change nothing, so an accidental click into a cell
// and straight back out doesn't bump updatedAt or wake the change signal.
export function isNoOpEdit(person: Person, field: InlineField, raw: string) {
  return inlineEditValue(person, field) === raw.trim()
}
