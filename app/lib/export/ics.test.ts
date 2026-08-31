import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  buildIcsEvents,
  buildIcsText,
  exportAnniversariesIcs,
  foldLine,
} from "~/lib/export/ics"
import type { PartialDate, Person, Relationship } from "~/lib/types"

function person(id: string, overrides: Partial<Person> = {}): Person {
  return { id, givenName: id, createdAt: 0, updatedAt: 0, ...overrides }
}

function spouse(
  id: string,
  from: string,
  to: string,
  start?: PartialDate,
  end?: PartialDate
): Relationship {
  return { id, type: "spouse", from, to, start, end }
}

const NOW = new Date(Date.UTC(2026, 7, 31, 12, 30, 45))

describe("buildIcsEvents", () => {
  it("emits a birthday for a full birth date", () => {
    const events = buildIcsEvents(
      [
        person("p1", {
          givenName: "Ada",
          familyName: "Lovelace",
          birth: { year: 1815, month: 12, day: 10 },
        }),
      ],
      []
    )
    expect(events).toEqual([
      {
        uid: "birth-p1@family-tree-generator.local",
        summary: "Ada Lovelace — birthday",
        year: 1815,
        month: 12,
        day: 10,
      },
    ])
  })

  it("emits an anniversary naming both spouses", () => {
    const events = buildIcsEvents(
      [person("a", { givenName: "Ada" }), person("b", { givenName: "Bob" })],
      [spouse("r1", "a", "b", { year: 1990, month: 6, day: 1 })]
    )
    expect(events).toHaveLength(1)
    expect(events[0].summary).toBe("Ada & Bob — anniversary")
    expect(events[0].uid).toBe("marriage-r1@family-tree-generator.local")
  })

  it("requires a year, unlike the Insights section", () => {
    // A recurrence has nothing to anchor to without one.
    expect(
      buildIcsEvents([person("p1", { birth: { month: 5, day: 3 } })], [])
    ).toEqual([])
  })

  it("skips a date with no day, and an approximate one", () => {
    expect(
      buildIcsEvents(
        [
          person("p1", { birth: { year: 1900, month: 5 } }),
          person("p2", {
            birth: { year: 1900, month: 5, day: 3, approximate: true },
          }),
        ],
        []
      )
    ).toEqual([])
  })

  it("skips an ended marriage", () => {
    expect(
      buildIcsEvents(
        [person("a"), person("b")],
        [
          spouse(
            "r1",
            "a",
            "b",
            { year: 1990, month: 6, day: 1 },
            { year: 2005, month: 1, day: 1 }
          ),
        ]
      )
    ).toEqual([])
  })

  it("omits death anniversaries", () => {
    // A recurring reminder of a death is a different kind of thing from a
    // birthday and must not arrive in a calendar unasked.
    const events = buildIcsEvents(
      [person("p1", { death: { year: 1980, month: 3, day: 4 } })],
      []
    )
    expect(events).toEqual([])
  })

  it("is ordered deterministically", () => {
    const people = [
      person("p2", { birth: { year: 1950, month: 1, day: 1 } }),
      person("p1", { birth: { year: 1960, month: 1, day: 1 } }),
    ]
    expect(buildIcsEvents(people, [])).toEqual(buildIcsEvents(people, []))
    expect(buildIcsEvents(people, []).map((e) => e.uid)).toEqual([
      "birth-p1@family-tree-generator.local",
      "birth-p2@family-tree-generator.local",
    ])
  })
})

describe("buildIcsText", () => {
  it("produces a complete calendar for one birthday", () => {
    const text = buildIcsText(
      buildIcsEvents(
        [
          person("p1", {
            givenName: "Ada",
            birth: { year: 1815, month: 12, day: 10 },
          }),
        ],
        []
      ),
      NOW
    )
    expect(text).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Family Tree Generator//Family Tree Generator 1.0//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Family Tree anniversaries",
        "BEGIN:VEVENT",
        "UID:birth-p1@family-tree-generator.local",
        "DTSTAMP:20260831T123045Z",
        "DTSTART;VALUE=DATE:18151210",
        "DTEND;VALUE=DATE:18151211",
        "RRULE:FREQ=YEARLY",
        "SUMMARY:Ada — birthday",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n") + "\r\n"
    )
  })

  it("uses CRLF throughout, as RFC 5545 requires", () => {
    const text = buildIcsText([], NOW)
    expect(text.includes("\r\n")).toBe(true)
    expect(text.replace(/\r\n/g, "")).not.toContain("\n")
  })

  it("rolls DTEND over a month and year boundary", () => {
    const text = buildIcsText(
      [{ uid: "u@x", summary: "s", year: 1999, month: 12, day: 31 }],
      NOW
    )
    expect(text).toContain("DTSTART;VALUE=DATE:19991231")
    expect(text).toContain("DTEND;VALUE=DATE:20000101")
  })

  it("still produces a valid empty calendar", () => {
    const text = buildIcsText([], NOW)
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(text).not.toContain("VEVENT")
  })

  it("escapes the characters RFC 5545 reserves in TEXT", () => {
    const text = buildIcsText(
      [
        {
          uid: "u@x",
          summary: "Semi; comma, back\\slash",
          year: 2000,
          month: 1,
          day: 1,
        },
      ],
      NOW
    )
    // String.raw so the expectation says what it means: a JS string literal
    // silently drops the backslash in "\;", which is exactly the bug this test
    // exists to catch.
    expect(text).toContain(String.raw`SUMMARY:Semi\; comma\, back\\slash`)
  })

  it("pads a year before 1000 to four digits", () => {
    const text = buildIcsText(
      [{ uid: "u@x", summary: "s", year: 850, month: 3, day: 4 }],
      NOW
    )
    expect(text).toContain("DTSTART;VALUE=DATE:08500304")
  })
})

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short")
  })

  it("folds a long line with CRLF and a leading space", () => {
    const folded = foldLine("SUMMARY:" + "a".repeat(200))
    const segments = folded.split("\r\n")
    expect(segments.length).toBeGreaterThan(1)
    expect(segments[0]).toHaveLength(75)
    for (const segment of segments.slice(1)) {
      expect(segment.startsWith(" ")).toBe(true)
      expect(segment.length).toBeLessThanOrEqual(75)
    }
    expect(segments.join("").replace(/^ | /g, "")).toContain("a".repeat(50))
  })

  it("never splits a multi-byte character across a fold", () => {
    // Each of these is 3 octets, so a naive character-count fold would cut one
    // in half and the calendar app would show mojibake.
    const folded = foldLine("SUMMARY:" + "字".repeat(60))
    const encoder = new TextEncoder()
    for (const segment of folded.split("\r\n")) {
      expect(encoder.encode(segment).length).toBeLessThanOrEqual(75)
    }
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "字".repeat(60))
  })
})

afterEach(async () => {
  await Promise.all([db.people.clear(), db.relationships.clear()])
})

describe("exportAnniversariesIcs", () => {
  it("reads the whole pool and returns a text/calendar blob", async () => {
    await db.people.bulkAdd([
      person("p1", {
        givenName: "Ada",
        birth: { year: 1815, month: 12, day: 10 },
      }),
      person("p2", { givenName: "NoDate" }),
    ])

    const blob = await exportAnniversariesIcs(NOW)
    expect(blob.type).toBe("text/calendar;charset=utf-8")
    const text = await blob.text()
    expect(text).toContain("SUMMARY:Ada — birthday")
    expect(text).not.toContain("NoDate")
  })
})
