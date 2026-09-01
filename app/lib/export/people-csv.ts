// The spreadsheet-shaped view of the pool. Families collect this data in
// spreadsheets, so this is the format they already have; it is deliberately
// NOT an interchange format.
//
// What it carries: names, sex, birth and death, notes, and the family
// structure as two parent columns and a spouse list. What it does not carry:
// how a parent-child link came about, marriage dates, photos, custom fields,
// tree membership. GEDCOM and the .zip backup carry those, and the .zip is the
// lossless one. Import is additive and never rewrites a link that already
// exists, so a round-trip through a spreadsheet cannot quietly turn an adopted
// link biological — the fields CSV can't see, it can't damage.

import { isBlankRow, parseCsv, toCsv } from "~/lib/export/csv"
import { personDisplayName } from "~/lib/person-name"
import type { PartialDate, Person, Relationship, Sex } from "~/lib/types"

export const PEOPLE_CSV_COLUMNS = [
  "Id",
  "Given name",
  "Family name",
  "Maiden name",
  "Nickname",
  "Sex",
  "Birth",
  "Death",
  "Parent 1",
  "Parent 2",
  "Spouses",
  "Notes",
] as const

// Two parent columns rather than "Father" and "Mother": the model caps parents
// at two and does not require either to have a recorded sex, so naming them by
// role would be both a presumption and a third place that cap is stated.
const PARENT_COLUMNS = 2

// Spouses go in one cell because a person can have several. Semicolon rather
// than comma so the cell needs no quoting in the common case, and because a
// comma is what a spreadsheet user is most likely to have inside a name.
export const SPOUSE_SEPARATOR = ";"

// A year-first date sorts correctly as text in a spreadsheet, which the app's
// own "3 May 1890" display format does not. Import accepts both.
export function formatCsvDate(date: PartialDate | undefined): string {
  if (!date || date.year === undefined) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  let text = String(date.year)
  if (date.month !== undefined) {
    text += `-${pad(date.month)}`
    if (date.day !== undefined) text += `-${pad(date.day)}`
  }
  return date.approximate ? `c. ${text}` : text
}

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
]

// Accepts what this writer produces (1890, 1890-05, 1890-05-03) and what the
// app displays elsewhere (1890, May 1890, 3 May 1890), each optionally prefixed
// "c." or "abt" for an approximate date. Anything else is refused rather than
// guessed at: a date the importer invented would be indistinguishable from one
// a relative recorded.
export function parseCsvDate(raw: string): PartialDate | undefined {
  let text = raw.trim()
  if (text === "") return undefined

  let approximate = false
  const circa = /^(c\.?|ca\.?|abt\.?|about|circa)\s+/i.exec(text)
  if (circa) {
    approximate = true
    text = text.slice(circa[0].length).trim()
  }

  const iso = /^(-?\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(text)
  if (iso) {
    const [, year, month, day] = iso
    return build(
      Number.parseInt(year, 10),
      month ? Number.parseInt(month, 10) : undefined,
      day ? Number.parseInt(day, 10) : undefined,
      approximate
    )
  }

  // "3 May 1890" or "May 1890".
  const named = /^(?:(\d{1,2})\s+)?([A-Za-z]{3,})\s+(-?\d{1,4})$/.exec(text)
  if (named) {
    const [, day, monthName, year] = named
    const month = MONTH_NAMES.indexOf(monthName.slice(0, 3).toLowerCase()) + 1
    if (month === 0) return undefined
    return build(
      Number.parseInt(year, 10),
      month,
      day ? Number.parseInt(day, 10) : undefined,
      approximate
    )
  }

  return undefined
}

function build(
  year: number,
  month: number | undefined,
  day: number | undefined,
  approximate: boolean
): PartialDate | undefined {
  if (month !== undefined && (month < 1 || month > 12)) return undefined
  if (day !== undefined && (day < 1 || day > 31)) return undefined
  const date: PartialDate = { year }
  if (month !== undefined) date.month = month
  if (day !== undefined) date.day = day
  if (approximate) date.approximate = true
  return date
}

function parseSex(raw: string): Sex | undefined {
  const value = raw.trim().toLowerCase()
  if (value === "m" || value === "male") return "male"
  if (value === "f" || value === "female") return "female"
  if (value === "o" || value === "other") return "other"
  return undefined
}

export interface PeopleCsvSource {
  people: Person[]
  relationships: Relationship[]
}

export function peopleToCsvRows({
  people,
  relationships,
}: PeopleCsvSource): string[][] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const nameOf = (id: string) => {
    const person = byId.get(id)
    return person ? personDisplayName(person) : ""
  }

  const parents = new Map<string, string[]>()
  const spouses = new Map<string, string[]>()
  for (const r of relationships) {
    if (r.type === "parent-child") {
      parents.set(r.to, [...(parents.get(r.to) ?? []), r.from])
    } else {
      spouses.set(r.from, [...(spouses.get(r.from) ?? []), r.to])
      spouses.set(r.to, [...(spouses.get(r.to) ?? []), r.from])
    }
  }

  const rows: string[][] = [[...PEOPLE_CSV_COLUMNS]]
  for (const person of people) {
    const parentIds = parents.get(person.id) ?? []
    rows.push([
      person.id,
      person.givenName,
      person.familyName ?? "",
      person.maidenName ?? "",
      person.nickname ?? "",
      person.sex ?? "",
      formatCsvDate(person.birth),
      formatCsvDate(person.death),
      ...Array.from({ length: PARENT_COLUMNS }, (_, i) =>
        parentIds[i] ? nameOf(parentIds[i]) : ""
      ),
      (spouses.get(person.id) ?? [])
        .map(nameOf)
        .filter(Boolean)
        .join(`${SPOUSE_SEPARATOR} `),
      person.notes ?? "",
    ])
  }
  return rows
}

export function buildPeopleCsv(source: PeopleCsvSource): string {
  return toCsv(peopleToCsvRows(source))
}

export interface ParsedPersonRow {
  // 1-based, counting the header, so a message can name the row the reader
  // sees in their spreadsheet.
  lineNumber: number
  id?: string
  givenName: string
  familyName?: string
  maidenName?: string
  nickname?: string
  sex?: Sex
  birth?: PartialDate
  death?: PartialDate
  notes?: string
  parentRefs: string[]
  spouseRefs: string[]
}

export interface ParsedPeopleCsv {
  rows: ParsedPersonRow[]
  // Things that could not be read. Each names its row, and the row is skipped
  // rather than half-imported.
  problems: string[]
}

export class InvalidCsvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidCsvError"
  }
}

function headerIndex(header: string[]): Map<string, number> {
  const index = new Map<string, number>()
  header.forEach((name, i) => {
    index.set(name.trim().toLowerCase(), i)
  })
  return index
}

export function parsePeopleCsv(text: string): ParsedPeopleCsv {
  const table = parseCsv(text).filter((row) => !isBlankRow(row))
  if (table.length === 0) throw new InvalidCsvError("That file is empty.")

  const index = headerIndex(table[0])
  const column = (name: string) => index.get(name.toLowerCase())

  const givenNameColumn = column("Given name")
  if (givenNameColumn === undefined) {
    throw new InvalidCsvError(
      `This doesn't look like a people CSV — it needs a "Given name" column. Expected columns: ${PEOPLE_CSV_COLUMNS.join(", ")}.`
    )
  }

  const rows: ParsedPersonRow[] = []
  const problems: string[] = []

  for (let i = 1; i < table.length; i++) {
    const raw = table[i]
    const lineNumber = i + 1
    const at = (name: string) => {
      const c = column(name)
      return c === undefined ? "" : (raw[c] ?? "").trim()
    }

    const givenName = (raw[givenNameColumn] ?? "").trim()
    if (givenName === "") {
      problems.push(`Row ${lineNumber}: no given name — skipped.`)
      continue
    }

    const birthText = at("Birth")
    const birth = parseCsvDate(birthText)
    if (birthText !== "" && !birth) {
      problems.push(
        `Row ${lineNumber}: couldn't read the birth date "${birthText}" — left blank.`
      )
    }
    const deathText = at("Death")
    const death = parseCsvDate(deathText)
    if (deathText !== "" && !death) {
      problems.push(
        `Row ${lineNumber}: couldn't read the death date "${deathText}" — left blank.`
      )
    }

    const parentRefs = Array.from({ length: PARENT_COLUMNS }, (_, p) =>
      at(`Parent ${p + 1}`)
    ).filter(Boolean)

    rows.push({
      lineNumber,
      id: at("Id") || undefined,
      givenName,
      familyName: at("Family name") || undefined,
      maidenName: at("Maiden name") || undefined,
      nickname: at("Nickname") || undefined,
      sex: parseSex(at("Sex")),
      birth,
      death,
      notes: at("Notes") || undefined,
      parentRefs,
      spouseRefs: at("Spouses")
        .split(SPOUSE_SEPARATOR)
        .map((s) => s.trim())
        .filter(Boolean),
    })
  }

  return { rows, problems }
}
