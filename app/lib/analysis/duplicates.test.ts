import { describe, expect, it } from "vitest"

import { findDuplicates } from "~/lib/analysis/duplicates"
import type { Person, Relationship } from "~/lib/types"

function person(id: string, overrides: Partial<Person> = {}): Person {
  return { id, givenName: id, createdAt: 0, updatedAt: 0, ...overrides }
}

function parentChild(from: string, to: string): Relationship {
  return { id: `${from}->${to}`, type: "parent-child", from, to }
}

function spouse(from: string, to: string): Relationship {
  return { id: `${from}~${to}`, type: "spouse", from, to }
}

function pairIds(people: Person[], relationships: Relationship[] = []) {
  return findDuplicates(people, relationships).map((c) => c.personIds)
}

describe("findDuplicates — what it catches", () => {
  it("flags the same name and birth year recorded twice", () => {
    const found = findDuplicates(
      [
        person("a", {
          givenName: "Ada",
          familyName: "Lovelace",
          birth: { year: 1815 },
        }),
        person("b", {
          givenName: "Ada",
          familyName: "Lovelace",
          birth: { year: 1815 },
        }),
      ],
      []
    )
    expect(found).toHaveLength(1)
    expect(found[0].score).toBeGreaterThan(0.8)
    expect(found[0].reasons).toContain("Same given name")
    expect(found[0].reasons).toContain("Both born 1815")
  })

  it("tolerates a one-year discrepancy, as old records often carry", () => {
    const found = findDuplicates(
      [
        person("a", {
          givenName: "Ada",
          familyName: "Byron",
          birth: { year: 1815 },
        }),
        person("b", {
          givenName: "Ada",
          familyName: "Byron",
          birth: { year: 1816 },
        }),
      ],
      []
    )
    expect(found).toHaveLength(1)
    expect(found[0].reasons.join(" ")).toContain("within 1 year")
  })

  it("catches a typo in the given name", () => {
    const found = findDuplicates(
      [
        person("a", {
          givenName: "Katherine",
          familyName: "Reed",
          birth: { year: 1900 },
        }),
        person("b", {
          givenName: "Katharine",
          familyName: "Reed",
          birth: { year: 1900 },
        }),
      ],
      []
    )
    expect(found).toHaveLength(1)
    expect(found[0].reasons).toContain("Given names are nearly the same")
  })

  it("matches a married name against a recorded maiden name", () => {
    const found = findDuplicates(
      [
        person("a", {
          givenName: "Ada",
          familyName: "King",
          maidenName: "Byron",
        }),
        person("b", { givenName: "Ada", familyName: "Byron" }),
      ],
      []
    )
    expect(found).toHaveLength(1)
    expect(found[0].reasons).toContain("Surname matches a recorded maiden name")
  })

  it("ignores diacritics and casing", () => {
    expect(
      pairIds([
        person("a", { givenName: "José", familyName: "Núñez" }),
        person("b", { givenName: "jose", familyName: "nunez" }),
      ])
    ).toHaveLength(1)
  })

  it("uses a shared spouse as corroboration", () => {
    const found = findDuplicates(
      [
        person("a", { givenName: "Ada" }),
        person("b", { givenName: "Ada" }),
        person("s", { givenName: "Sam" }),
      ],
      [spouse("a", "s"), spouse("b", "s")]
    )
    expect(found).toHaveLength(1)
    expect(found[0].reasons).toContain("Share a spouse")
  })

  it("surfaces a placeholder against the real record it stands in for", () => {
    const found = findDuplicates(
      [
        person("a", {
          givenName: "Ada",
          familyName: "Reed",
          isPlaceholder: true,
        }),
        person("b", { givenName: "Ada", familyName: "Reed" }),
      ],
      []
    )
    expect(found).toHaveLength(1)
    expect(found[0].reasons).toContain("One of the two is a placeholder")
  })
})

describe("findDuplicates — what it refuses to flag", () => {
  it("never pairs two people already related to each other", () => {
    // A father and son with the same name score perfectly on every name signal
    // and are the commonest false positive in genealogy data. The user's own
    // record already says they are two people.
    expect(
      pairIds(
        [
          person("dad", { givenName: "John", familyName: "Smith" }),
          person("son", { givenName: "John", familyName: "Smith" }),
        ],
        [parentChild("dad", "son")]
      )
    ).toEqual([])
  })

  it("never pairs spouses with the same name", () => {
    expect(
      pairIds(
        [
          person("a", { givenName: "Alex", familyName: "Grey" }),
          person("b", { givenName: "Alex", familyName: "Grey" }),
        ],
        [spouse("a", "b")]
      )
    ).toEqual([])
  })

  it("rules out a recorded sex mismatch", () => {
    expect(
      pairIds([
        person("a", { givenName: "Alex", familyName: "Grey", sex: "female" }),
        person("b", { givenName: "Alex", familyName: "Grey", sex: "male" }),
      ])
    ).toEqual([])
  })

  it("still pairs when only one sex is recorded", () => {
    expect(
      pairIds([
        person("a", { givenName: "Alex", familyName: "Grey", sex: "female" }),
        person("b", { givenName: "Alex", familyName: "Grey" }),
      ])
    ).toHaveLength(1)
  })

  it("rules out birth years further apart than the tolerance", () => {
    expect(
      pairIds([
        person("a", {
          givenName: "Ada",
          familyName: "Reed",
          birth: { year: 1900 },
        }),
        person("b", {
          givenName: "Ada",
          familyName: "Reed",
          birth: { year: 1910 },
        }),
      ])
    ).toEqual([])
  })

  it("does not flag two people who only share a surname", () => {
    // Half a family tree shares a surname; this must never be enough.
    expect(
      pairIds([
        person("a", { givenName: "Ada", familyName: "Reed" }),
        person("b", { givenName: "Bartholomew", familyName: "Reed" }),
      ])
    ).toEqual([])
  })

  it("does not flag different people who share a birth year", () => {
    expect(
      pairIds([
        person("a", {
          givenName: "Ada",
          familyName: "Reed",
          birth: { year: 1900 },
        }),
        person("b", {
          givenName: "Zachary",
          familyName: "Kent",
          birth: { year: 1900 },
        }),
      ])
    ).toEqual([])
  })

  it("does not flag siblings with different names", () => {
    expect(
      pairIds(
        [
          person("m", { givenName: "Mum" }),
          person("a", { givenName: "Ada", familyName: "Reed" }),
          person("b", { givenName: "Bea", familyName: "Reed" }),
        ],
        [parentChild("m", "a"), parentChild("m", "b")]
      )
    ).toEqual([])
  })
})

describe("findDuplicates — output", () => {
  it("ranks higher-scoring pairs first", () => {
    const found = findDuplicates(
      [
        person("a1", {
          givenName: "Ada",
          familyName: "Reed",
          birth: { year: 1900 },
        }),
        person("a2", {
          givenName: "Ada",
          familyName: "Reed",
          birth: { year: 1900 },
        }),
        person("s", { givenName: "Sam", familyName: "Reed" }),
        person("b1", {
          givenName: "Bea",
          familyName: "Kent",
          birth: { year: 1880 },
        }),
        person("b2", {
          givenName: "Bea",
          familyName: "Kent",
          birth: { year: 1880 },
        }),
      ],
      [spouse("a1", "s"), spouse("a2", "s")]
    )
    // a1/a2 add a shared spouse on top of an exact name and birth year, so they
    // must outrank b1/b2, who have only the name and year.
    expect(found.length).toBeGreaterThanOrEqual(2)
    expect(found[0].personIds).toEqual(["a1", "a2"])
    expect(found[0].score).toBeGreaterThan(found[1].score)
  })

  it("drops a near-name match that nothing else corroborates", () => {
    // "Bea"/"Beah" plus a shared surname is not enough on its own. Genealogy
    // pools are full of similar names, and a list of weak guesses would train
    // the user to ignore the feature entirely.
    expect(
      pairIds([
        person("a", { givenName: "Bea", familyName: "Kent" }),
        person("b", { givenName: "Beah", familyName: "Kent" }),
      ])
    ).toEqual([])
  })

  it("respects the limit", () => {
    const people = Array.from({ length: 6 }, (_, i) =>
      person(`p${i}`, { givenName: "Ada", familyName: "Reed" })
    )
    expect(findDuplicates(people, [], { limit: 3 })).toHaveLength(3)
  })

  it("carries display labels for both sides", () => {
    const found = findDuplicates(
      [
        person("a", { givenName: "Ada", familyName: "Reed", nickname: "Addy" }),
        person("b", { givenName: "Ada", familyName: "Reed" }),
      ],
      []
    )
    expect(found[0].labels).toEqual(["Ada “Addy” Reed", "Ada Reed"])
  })

  it("is stable across repeated runs", () => {
    const people = [
      person("a", { givenName: "Ada", familyName: "Reed" }),
      person("b", { givenName: "Ada", familyName: "Reed" }),
      person("c", { givenName: "Ada", familyName: "Reed" }),
    ]
    expect(findDuplicates(people, [])).toEqual(findDuplicates(people, []))
  })

  it("handles an empty pool", () => {
    expect(findDuplicates([], [])).toEqual([])
  })
})
