import { personDisplayName } from "~/lib/person-name"
import type { PartialDate, Person, Relationship } from "~/lib/types"

export type AnniversaryKind = "birth" | "death" | "marriage"

export interface Anniversary {
  kind: AnniversaryKind
  personIds: string[]
  label: string
  year?: number
  // Whole years since the event, when a year is recorded. Absent for a date
  // that records only a month and day.
  yearsAgo?: number
  // Birthdays of people with a recorded death read differently — "would have
  // turned 90" rather than "turns 90".
  deceased?: boolean
  daysUntil: number
}

const MS_PER_DAY = 86_400_000

export interface CalendarDay {
  month: number
  day: number
  year?: number
}

// A date can only land on a calendar day if it records one. A year alone, or a
// year and month, cannot.
//
// Approximate dates are excluded too: "c. 3 May 1890" says the day is a guess,
// and marking an anniversary on a guessed day would present an estimate as a
// fact — the same rule the validator follows.
//
// Exported because the .ics writer must apply exactly this rule: a calendar
// file and this view disagreeing about which dates are real would be a bug
// nobody would think to look for.
export function exactCalendarDay(date?: PartialDate): CalendarDay | undefined {
  if (!date || date.month === undefined || date.day === undefined)
    return undefined
  if (date.approximate) return undefined
  return { month: date.month, day: date.day, year: date.year }
}

// Days from `from` to the next occurrence of month/day, 0 meaning today.
//
// 29 February in a non-leap year rolls to 1 March, which is JavaScript's own
// behaviour and the choice we want: an anniversary that appeared only one year
// in four would be worse than one that shifts by a day.
function daysUntil(month: number, day: number, from: Date): number {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  let next = new Date(today.getFullYear(), month - 1, day)
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day)
  }
  return Math.round((next.getTime() - today.getTime()) / MS_PER_DAY)
}

const KIND_ORDER: Record<AnniversaryKind, number> = {
  birth: 0,
  marriage: 1,
  death: 2,
}

export interface AnniversaryOptions {
  // 0 (the default) means today only. A larger window also returns the days
  // ahead, which is what makes this useful to somebody who doesn't open the app
  // every morning.
  withinDays?: number
}

export function findAnniversaries(
  people: Person[],
  relationships: Relationship[],
  today: Date,
  { withinDays = 0 }: AnniversaryOptions = {}
): Anniversary[] {
  const byId = new Map(people.map((person) => [person.id, person]))
  const found: Anniversary[] = []

  const consider = (
    date: PartialDate | undefined,
    build: (occurrence: {
      year?: number
      daysUntil: number
    }) => Anniversary | undefined
  ) => {
    const occurrence = exactCalendarDay(date)
    if (!occurrence) return
    const days = daysUntil(occurrence.month, occurrence.day, today)
    if (days > withinDays) return
    const anniversary = build({ year: occurrence.year, daysUntil: days })
    if (anniversary) found.push(anniversary)
  }

  for (const person of people) {
    consider(person.birth, ({ year, daysUntil: days }) => ({
      kind: "birth",
      personIds: [person.id],
      label: personDisplayName(person),
      year,
      yearsAgo: yearsAgo(year, today),
      deceased: !!person.death,
      daysUntil: days,
    }))
    consider(person.death, ({ year, daysUntil: days }) => ({
      kind: "death",
      personIds: [person.id],
      label: personDisplayName(person),
      year,
      yearsAgo: yearsAgo(year, today),
      daysUntil: days,
    }))
  }

  for (const relationship of relationships) {
    if (relationship.type !== "spouse") continue
    const a = byId.get(relationship.from)
    const b = byId.get(relationship.to)
    if (!a || !b) continue
    // A marriage that has ended is not an anniversary anyone is marking.
    if (relationship.end) continue
    consider(relationship.start, ({ year, daysUntil: days }) => ({
      kind: "marriage",
      personIds: [a.id, b.id],
      label: `${personDisplayName(a)} & ${personDisplayName(b)}`,
      year,
      yearsAgo: yearsAgo(year, today),
      daysUntil: days,
    }))
  }

  return found.sort(
    (x, y) =>
      x.daysUntil - y.daysUntil ||
      KIND_ORDER[x.kind] - KIND_ORDER[y.kind] ||
      x.label.localeCompare(y.label)
  )
}

function yearsAgo(year: number | undefined, today: Date): number | undefined {
  if (year === undefined) return undefined
  const years = today.getFullYear() - year
  return years >= 0 ? years : undefined
}
