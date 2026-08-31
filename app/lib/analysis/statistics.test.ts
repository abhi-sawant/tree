import { describe, expect, it } from "vitest"

import { computeStatistics } from "~/lib/analysis/statistics"
import type { PartialDate, Person, Relationship, Sex } from "~/lib/types"

function person(id: string, overrides: Partial<Person> = {}): Person {
  return { id, givenName: id, createdAt: 0, updatedAt: 0, ...overrides }
}

function parentChild(from: string, to: string): Relationship {
  return { id: `${from}->${to}`, type: "parent-child", from, to }
}

function spouse(
  from: string,
  to: string,
  start?: PartialDate,
  end?: PartialDate
): Relationship {
  return { id: `${from}~${to}`, type: "spouse", from, to, start, end }
}

describe("computeStatistics — counts", () => {
  it("counts people and placeholders", () => {
    const stats = computeStatistics(
      [person("a"), person("b", { isPlaceholder: true })],
      []
    )
    expect(stats.peopleCount).toBe(2)
    expect(stats.placeholderCount).toBe(1)
  })

  it("counts people per generation, in generation order", () => {
    const stats = computeStatistics(
      [person("gp"), person("p"), person("c")],
      [parentChild("gp", "p"), parentChild("p", "c")]
    )
    expect(stats.generations).toEqual([
      { generation: 0, count: 1 },
      { generation: 1, count: 1 },
      { generation: 2, count: 1 },
    ])
  })

  it("buckets sex, counting an absent value as unrecorded", () => {
    const stats = computeStatistics(
      [
        person("a", { sex: "female" }),
        person("b", { sex: "male" }),
        person("c", { sex: "other" }),
        person("d"),
      ],
      []
    )
    expect(stats.sexCounts).toEqual({
      female: 1,
      male: 1,
      other: 1,
      unrecorded: 1,
    })
  })

  it("ignores relationships reaching outside the scoped people", () => {
    // The caller scopes `people` to a tree; a relationship to a non-member must
    // not contribute, or per-tree stats would silently count the whole pool.
    const stats = computeStatistics(
      [person("a")],
      [parentChild("a", "outsider"), parentChild("outsider", "a")]
    )
    expect(stats.mostChildren).toBeUndefined()
    expect(stats.generations).toEqual([{ generation: 0, count: 1 }])
  })
})

describe("computeStatistics — lifespans", () => {
  it("averages only people with both years, and reports the sample size", () => {
    const stats = computeStatistics(
      [
        person("a", { birth: { year: 1900 }, death: { year: 1980 } }), // 80
        person("b", { birth: { year: 1900 }, death: { year: 1960 } }), // 60
        person("c", { birth: { year: 1900 } }), // no death — excluded
        person("d"), // nothing — excluded
      ],
      []
    )
    expect(stats.averageLifespan).toBe(70)
    expect(stats.lifespanSampleSize).toBe(2)
  })

  it("leaves the average undefined when nobody qualifies", () => {
    const stats = computeStatistics(
      [person("a", { birth: { year: 1900 } })],
      []
    )
    expect(stats.averageLifespan).toBeUndefined()
    expect(stats.lifespanSampleSize).toBe(0)
  })

  it("excludes a negative span rather than letting it poison the average", () => {
    // Contradictory data; the Health view is what reports it.
    const stats = computeStatistics(
      [
        person("a", { birth: { year: 1900 }, death: { year: 1980 } }),
        person("bad", { birth: { year: 1980 }, death: { year: 1900 } }),
      ],
      []
    )
    expect(stats.averageLifespan).toBe(80)
    expect(stats.lifespanSampleSize).toBe(1)
  })

  it("names the longest life", () => {
    const stats = computeStatistics(
      [
        person("a", { birth: { year: 1900 }, death: { year: 1950 } }),
        person("b", { birth: { year: 1900 }, death: { year: 1999 } }),
      ],
      []
    )
    expect(stats.longestLife?.personIds).toEqual(["b"])
    expect(stats.longestLife?.value).toBe(99)
  })

  it("reports the birth-year range and coverage", () => {
    const stats = computeStatistics(
      [
        person("a", { birth: { year: 1870 } }),
        person("b", { birth: { year: 1999 } }),
        person("c"),
      ],
      []
    )
    expect(stats.earliestBirthYear).toBe(1870)
    expect(stats.latestBirthYear).toBe(1999)
    expect(stats.withBirthYear).toBe(2)
  })
})

describe("computeStatistics — family superlatives", () => {
  it("finds who has the most children", () => {
    const stats = computeStatistics(
      [person("p"), person("q"), person("c1"), person("c2"), person("c3")],
      [parentChild("p", "c1"), parentChild("p", "c2"), parentChild("q", "c3")]
    )
    expect(stats.mostChildren?.personIds).toEqual(["p"])
    expect(stats.mostChildren?.value).toBe(2)
  })

  it("finds the largest sibling group", () => {
    const stats = computeStatistics(
      [person("m"), person("f"), person("c1"), person("c2"), person("c3")],
      [
        parentChild("m", "c1"),
        parentChild("f", "c1"),
        parentChild("m", "c2"),
        parentChild("f", "c2"),
        parentChild("m", "c3"),
        parentChild("f", "c3"),
      ]
    )
    expect(stats.largestSiblingGroup?.value).toBe(3)
    expect(stats.largestSiblingGroup?.personIds).toEqual(["c1", "c2", "c3"])
  })

  it("keeps half-siblings in their own group", () => {
    // c1/c2 share both parents; c3 shares only the mother, so grouping by the
    // full parent set must not merge them into a group of three.
    const stats = computeStatistics(
      [
        person("m"),
        person("f1"),
        person("f2"),
        person("c1"),
        person("c2"),
        person("c3"),
      ],
      [
        parentChild("m", "c1"),
        parentChild("f1", "c1"),
        parentChild("m", "c2"),
        parentChild("f1", "c2"),
        parentChild("m", "c3"),
        parentChild("f2", "c3"),
      ]
    )
    expect(stats.largestSiblingGroup?.value).toBe(2)
  })

  it("ignores an only child as a sibling group", () => {
    const stats = computeStatistics(
      [person("m"), person("c")],
      [parentChild("m", "c")]
    )
    expect(stats.largestSiblingGroup).toBeUndefined()
  })
})

describe("computeStatistics — longest marriage", () => {
  it("measures a marriage with both start and end recorded", () => {
    const stats = computeStatistics(
      [person("a"), person("b")],
      [spouse("a", "b", { year: 1950 }, { year: 1990 })]
    )
    expect(stats.longestMarriage?.value).toBe(40)
    expect(stats.longestMarriage?.personIds).toEqual(["a", "b"])
  })

  it("falls back to the first spouse's death when there is no end date", () => {
    const stats = computeStatistics(
      [
        person("a", { death: { year: 1975 } }),
        person("b", { death: { year: 1999 } }),
      ],
      [spouse("a", "b", { year: 1950 })]
    )
    expect(stats.longestMarriage?.value).toBe(25)
  })

  it("skips a marriage whose length is unknowable", () => {
    // No end date and no death on either side — treating this as running to the
    // present would invent a number for people who are probably long dead.
    const stats = computeStatistics(
      [person("a"), person("b")],
      [spouse("a", "b", { year: 1950 })]
    )
    expect(stats.longestMarriage).toBeUndefined()
  })

  it("skips a marriage with no start date", () => {
    const stats = computeStatistics(
      [person("a", { death: { year: 1990 } }), person("b")],
      [spouse("a", "b")]
    )
    expect(stats.longestMarriage).toBeUndefined()
  })
})

describe("computeStatistics — surnames", () => {
  it("ranks surnames by frequency, then alphabetically", () => {
    const stats = computeStatistics(
      [
        person("a", { familyName: "Smith" }),
        person("b", { familyName: "Smith" }),
        person("c", { familyName: "Adams" }),
        person("d", { familyName: "Zeta" }),
        person("e", {}),
      ],
      []
    )
    expect(stats.surnames).toEqual([
      { surname: "Smith", count: 2 },
      { surname: "Adams", count: 1 },
      { surname: "Zeta", count: 1 },
    ])
  })

  it("ignores a blank family name", () => {
    const stats = computeStatistics([person("a", { familyName: "   " })], [])
    expect(stats.surnames).toEqual([])
  })
})

describe("computeStatistics — determinism", () => {
  it("returns the same result for the same input", () => {
    const people = [
      person("a", {
        familyName: "X",
        birth: { year: 1900 },
        death: { year: 1980 },
        sex: "female" as Sex,
      }),
      person("b", { familyName: "X", birth: { year: 1930 } }),
    ]
    const rels = [parentChild("a", "b"), spouse("a", "b", { year: 1925 })]
    expect(computeStatistics(people, rels)).toEqual(
      computeStatistics(people, rels)
    )
  })

  it("handles an empty pool without throwing", () => {
    const stats = computeStatistics([], [])
    expect(stats.peopleCount).toBe(0)
    expect(stats.generations).toEqual([])
    expect(stats.surnames).toEqual([])
    expect(stats.averageLifespan).toBeUndefined()
  })
})
