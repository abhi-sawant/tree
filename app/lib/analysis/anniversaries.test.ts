import { describe, expect, it } from "vitest"

import { findAnniversaries } from "~/lib/analysis/anniversaries"
import type { PartialDate, Person, Relationship } from "~/lib/types"

function person(id: string, overrides: Partial<Person> = {}): Person {
  return { id, givenName: id, createdAt: 0, updatedAt: 0, ...overrides }
}

function spouse(
  from: string,
  to: string,
  start?: PartialDate,
  end?: PartialDate
): Relationship {
  return { id: `${from}~${to}`, type: "spouse", from, to, start, end }
}

// 3 May 2026, a Sunday in a non-leap year.
const TODAY = new Date(2026, 4, 3)

describe("findAnniversaries — matching today", () => {
  it("finds a birthday falling today", () => {
    const found = findAnniversaries(
      [person("a", { birth: { year: 1950, month: 5, day: 3 } })],
      [],
      TODAY
    )
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe("birth")
    expect(found[0].yearsAgo).toBe(76)
    expect(found[0].daysUntil).toBe(0)
  })

  it("ignores a date on another day", () => {
    expect(
      findAnniversaries(
        [person("a", { birth: { year: 1950, month: 5, day: 4 } })],
        [],
        TODAY
      )
    ).toEqual([])
  })

  it("matches on month and day regardless of year", () => {
    const found = findAnniversaries(
      [person("a", { birth: { month: 5, day: 3 } })],
      [],
      TODAY
    )
    expect(found).toHaveLength(1)
    expect(found[0].yearsAgo).toBeUndefined()
  })

  it("marks a birthday of someone with a recorded death as deceased", () => {
    const found = findAnniversaries(
      [
        person("a", {
          birth: { year: 1950, month: 5, day: 3 },
          death: { year: 2000, month: 1, day: 1 },
        }),
      ],
      [],
      TODAY
    )
    expect(found[0].deceased).toBe(true)
  })

  it("finds a death anniversary", () => {
    const found = findAnniversaries(
      [person("a", { death: { year: 2000, month: 5, day: 3 } })],
      [],
      TODAY
    )
    expect(found.map((f) => f.kind)).toEqual(["death"])
    expect(found[0].yearsAgo).toBe(26)
  })

  it("finds a wedding anniversary and names both spouses", () => {
    const found = findAnniversaries(
      [person("a"), person("b")],
      [spouse("a", "b", { year: 1990, month: 5, day: 3 })],
      TODAY
    )
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe("marriage")
    expect(found[0].personIds).toEqual(["a", "b"])
    expect(found[0].label).toBe("a & b")
  })
})

describe("findAnniversaries — what it refuses to match", () => {
  it("skips a date with no day recorded", () => {
    expect(
      findAnniversaries(
        [person("a", { birth: { year: 1950, month: 5 } })],
        [],
        TODAY
      )
    ).toEqual([])
  })

  it("skips a bare year", () => {
    expect(
      findAnniversaries([person("a", { birth: { year: 1950 } })], [], TODAY)
    ).toEqual([])
  })

  it("skips an approximate date even when it names the day", () => {
    // "c. 3 May 1890" says the day itself is a guess; marking an anniversary on
    // it would dress an estimate up as a fact.
    expect(
      findAnniversaries(
        [
          person("a", {
            birth: { year: 1890, month: 5, day: 3, approximate: true },
          }),
        ],
        [],
        TODAY
      )
    ).toEqual([])
  })

  it("skips a marriage that has ended", () => {
    expect(
      findAnniversaries(
        [person("a"), person("b")],
        [
          spouse(
            "a",
            "b",
            { year: 1990, month: 5, day: 3 },
            { year: 2001, month: 6, day: 1 }
          ),
        ],
        TODAY
      )
    ).toEqual([])
  })

  it("skips a marriage whose spouse is not in the pool", () => {
    expect(
      findAnniversaries(
        [person("a")],
        [spouse("a", "ghost", { year: 1990, month: 5, day: 3 })],
        TODAY
      )
    ).toEqual([])
  })

  it("leaves yearsAgo undefined for a date in the future", () => {
    const found = findAnniversaries(
      [person("a", { birth: { year: 2030, month: 5, day: 3 } })],
      [],
      TODAY
    )
    expect(found[0].yearsAgo).toBeUndefined()
  })
})

describe("findAnniversaries — the upcoming window", () => {
  it("returns nothing ahead by default", () => {
    expect(
      findAnniversaries(
        [person("a", { birth: { year: 1950, month: 5, day: 10 } })],
        [],
        TODAY
      )
    ).toEqual([])
  })

  it("includes dates inside the window and excludes those past it", () => {
    const found = findAnniversaries(
      [
        person("soon", { birth: { year: 1950, month: 5, day: 10 } }),
        person("later", { birth: { year: 1950, month: 7, day: 1 } }),
      ],
      [],
      TODAY,
      { withinDays: 30 }
    )
    expect(found.map((f) => f.label)).toEqual(["soon"])
    expect(found[0].daysUntil).toBe(7)
  })

  it("wraps into next year for a date already past this year", () => {
    const found = findAnniversaries(
      [person("a", { birth: { year: 1950, month: 1, day: 1 } })],
      [],
      TODAY,
      { withinDays: 400 }
    )
    // 1 Jan 2027 is 243 days after 3 May 2026.
    expect(found[0].daysUntil).toBe(243)
  })

  it("shifts a 29 February anniversary to 1 March in a non-leap year", () => {
    // Deliberate: an anniversary that surfaced one year in four would serve
    // nobody. 2026 is not a leap year, so this lands on 1 March 2027.
    const found = findAnniversaries(
      [person("a", { birth: { year: 1948, month: 2, day: 29 } })],
      [],
      TODAY,
      { withinDays: 400 }
    )
    expect(found).toHaveLength(1)
    const target = new Date(2027, 2, 1)
    const base = new Date(2026, 4, 3)
    expect(found[0].daysUntil).toBe(
      Math.round((target.getTime() - base.getTime()) / 86_400_000)
    )
  })
})

describe("findAnniversaries — ordering", () => {
  it("sorts by day, then birth before marriage before death, then name", () => {
    const found = findAnniversaries(
      [
        person("zoe", { death: { year: 2000, month: 5, day: 3 } }),
        person("amy", { birth: { year: 1950, month: 5, day: 3 } }),
        person("bob"),
        person("tomorrow", { birth: { year: 1950, month: 5, day: 4 } }),
      ],
      [spouse("amy", "bob", { year: 1975, month: 5, day: 3 })],
      TODAY,
      { withinDays: 5 }
    )
    expect(found.map((f) => `${f.daysUntil}:${f.kind}`)).toEqual([
      "0:birth",
      "0:marriage",
      "0:death",
      "1:birth",
    ])
  })

  it("is stable across repeated runs", () => {
    const people = [
      person("a", { birth: { year: 1950, month: 5, day: 3 } }),
      person("b", { birth: { year: 1960, month: 5, day: 3 } }),
    ]
    expect(findAnniversaries(people, [], TODAY)).toEqual(
      findAnniversaries(people, [], TODAY)
    )
  })
})
