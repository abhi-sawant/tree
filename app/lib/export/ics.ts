import { exactCalendarDay } from "~/lib/analysis/anniversaries"
import { db } from "~/lib/db/db"
import { personDisplayName } from "~/lib/person-name"
import type { Person, Relationship } from "~/lib/types"

// RFC 5545 caps a content line at 75 octets, and requires CRLF line breaks.
const MAX_LINE_OCTETS = 75
const CRLF = "\r\n"

const PRODID = "-//Family Tree Generator//Family Tree Generator 1.0//EN"

// A UID has to be stable across exports so re-importing an updated file updates
// the existing entries instead of duplicating them. The person or relationship
// id already is stable, so it does the work.
const UID_DOMAIN = "family-tree-generator.local"

export interface IcsEvent {
  uid: string
  summary: string
  year: number
  month: number
  day: number
}

// Backslash first, or the escapes added afterwards would themselves be escaped.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

// Folds on octets rather than characters, and never mid-character: a name with
// multi-byte letters split across a fold would arrive corrupted in the calendar
// app. Continuation lines carry a leading space that counts toward the limit,
// hence the tighter bound after the first.
export function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line

  const parts: string[] = []
  let current = ""
  let octets = 0
  let limit = MAX_LINE_OCTETS

  for (const char of line) {
    const size = encoder.encode(char).length
    if (octets + size > limit) {
      parts.push(current)
      current = ""
      octets = 0
      limit = MAX_LINE_OCTETS - 1
    }
    current += char
    octets += size
  }
  parts.push(current)

  return parts.join(`${CRLF} `)
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0")
}

function dateValue(year: number, month: number, day: number): string {
  return `${pad(year, 4)}${pad(month, 2)}${pad(day, 2)}`
}

function timestamp(now: Date): string {
  return (
    dateValue(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()) +
    "T" +
    `${pad(now.getUTCHours(), 2)}${pad(now.getUTCMinutes(), 2)}${pad(now.getUTCSeconds(), 2)}Z`
  )
}

// Births and marriages only. A recurring death-anniversary reminder is a
// different kind of thing from a birthday, and it should not arrive unasked in
// somebody's calendar — if it's wanted later it belongs behind an explicit
// choice, not a default.
//
// Whole pool, not the open tree, matching every other file export (D14).
export function buildIcsEvents(
  people: Person[],
  relationships: Relationship[]
): IcsEvent[] {
  const byId = new Map(people.map((person) => [person.id, person]))
  const events: IcsEvent[] = []

  for (const person of people) {
    const day = exactCalendarDay(person.birth)
    // A VEVENT needs a real start date, so unlike the Insights section this
    // also requires a year — there is nothing to anchor a recurrence to
    // without one.
    if (!day?.year) continue
    events.push({
      uid: `birth-${person.id}@${UID_DOMAIN}`,
      summary: `${personDisplayName(person)} — birthday`,
      year: day.year,
      month: day.month,
      day: day.day,
    })
  }

  for (const relationship of relationships) {
    if (relationship.type !== "spouse" || relationship.end) continue
    const a = byId.get(relationship.from)
    const b = byId.get(relationship.to)
    if (!a || !b) continue
    const day = exactCalendarDay(relationship.start)
    if (!day?.year) continue
    events.push({
      uid: `marriage-${relationship.id}@${UID_DOMAIN}`,
      summary: `${personDisplayName(a)} & ${personDisplayName(b)} — anniversary`,
      year: day.year,
      month: day.month,
      day: day.day,
    })
  }

  return events.sort((x, y) => x.uid.localeCompare(y.uid))
}

export function buildIcsText(
  events: IcsEvent[],
  now: Date = new Date()
): string {
  const stamp = timestamp(now)

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Family Tree anniversaries",
  ]

  for (const event of events) {
    // All-day event: DTEND is exclusive, so it points at the following day.
    // Date.UTC handles month and year rollover, so 31 December needs no special
    // case.
    const end = new Date(Date.UTC(event.year, event.month - 1, event.day + 1))
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateValue(event.year, event.month, event.day)}`,
      `DTEND;VALUE=DATE:${dateValue(
        end.getUTCFullYear(),
        end.getUTCMonth() + 1,
        end.getUTCDate()
      )}`,
      "RRULE:FREQ=YEARLY",
      `SUMMARY:${escapeText(event.summary)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    )
  }

  lines.push("END:VCALENDAR")

  return lines.map(foldLine).join(CRLF) + CRLF
}

export async function exportAnniversariesIcs(
  now: Date = new Date()
): Promise<Blob> {
  const [people, relationships] = await Promise.all([
    db.people.toArray(),
    db.relationships.toArray(),
  ])

  const text = buildIcsText(buildIcsEvents(people, relationships), now)
  return new Blob([text], { type: "text/calendar;charset=utf-8" })
}
