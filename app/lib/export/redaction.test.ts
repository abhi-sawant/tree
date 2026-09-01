import { describe, expect, it } from "vitest"

import {
  countPresumedLiving,
  isPresumedLiving,
  PRESUMED_LIFESPAN_YEARS,
  redactionNote,
  redactPerson,
  redactPool,
  REDACTED_GIVEN_NAME,
} from "~/lib/export/redaction"
import type { Person, Relationship } from "~/lib/types"

const NOW = new Date("2024-06-15T00:00:00.000Z")
const options = { now: NOW }

function person(id: string, overrides: Partial<Person> = {}): Person {
  return { id, givenName: id, createdAt: 1, updatedAt: 2, ...overrides }
}

describe("isPresumedLiving", () => {
  it("is settled by a recorded death", () => {
    expect(isPresumedLiving({ death: { year: 1990 } }, options)).toBe(false)
  })

  // A PartialDate with no year renders empty and reads as unknown everywhere
  // else, so treating one as proof of death would let a stray keystroke
  // unredact somebody.
  it("doesn't accept a death date with no year as proof of death", () => {
    expect(isPresumedLiving({ death: { month: 5 } }, options)).toBe(true)
  })

  it("presumes someone born well over a century ago has died", () => {
    expect(
      isPresumedLiving(
        { birth: { year: NOW.getFullYear() - PRESUMED_LIFESPAN_YEARS - 5 } },
        options
      )
    ).toBe(false)
  })

  it("redacts someone born recently", () => {
    expect(isPresumedLiving({ birth: { year: 1990 } }, options)).toBe(true)
  })

  // The cut-off is a span comparison, so a bare year that straddles it is not
  // decided — and undecided means redacted.
  it("redacts a birth year that only just reaches the cut-off", () => {
    const straddling = NOW.getFullYear() - PRESUMED_LIFESPAN_YEARS
    expect(isPresumedLiving({ birth: { year: straddling } }, options)).toBe(
      true
    )
  })

  it("redacts an approximate date that could fall either side", () => {
    const year = NOW.getFullYear() - PRESUMED_LIFESPAN_YEARS - 1
    expect(
      isPresumedLiving({ birth: { year, approximate: true } }, options)
    ).toBe(true)
    // The same year stated exactly is decided, and not redacted.
    expect(isPresumedLiving({ birth: { year } }, options)).toBe(false)
  })

  // The rule that inverts the validator: nothing recorded means redact.
  it("redacts someone with no dates at all", () => {
    expect(isPresumedLiving({}, options)).toBe(true)
  })

  it("takes the lifespan as an argument", () => {
    expect(
      isPresumedLiving(
        { birth: { year: 1950 } },
        { now: NOW, presumedLifespanYears: 20 }
      )
    ).toBe(false)
  })
})

describe("redactPerson", () => {
  const full = person("p1", {
    givenName: "Ada",
    familyName: "Lovelace",
    maidenName: "Byron",
    nickname: "Addy",
    sex: "female",
    birth: { year: 1990 },
    death: undefined,
    notes: "Private",
    customFields: [{ label: "Occupation", value: "Engineer" }],
    photoIds: ["a", "b"],
    photoId: "a",
    multipleBirthGroup: "twins",
    isPlaceholder: true,
  })

  it("withholds the identifying details", () => {
    const redacted = redactPerson(full)

    expect(redacted.givenName).toBe(REDACTED_GIVEN_NAME)
    expect(redacted.maidenName).toBeUndefined()
    expect(redacted.nickname).toBeUndefined()
    expect(redacted.birth).toBeUndefined()
    expect(redacted.death).toBeUndefined()
    expect(redacted.notes).toBeUndefined()
    expect(redacted.customFields).toBeUndefined()
    expect(redacted.photoIds).toBeUndefined()
    expect(redacted.photoId).toBeUndefined()
  })

  // Hiding the surname would leave a chart of identical "Living" cards nobody
  // can read, and protects almost nothing in a document that is a family tree.
  it("keeps the surname, the sex and everything structural", () => {
    const redacted = redactPerson(full)

    expect(redacted.familyName).toBe("Lovelace")
    expect(redacted.sex).toBe("female")
    expect(redacted.id).toBe("p1")
    expect(redacted.createdAt).toBe(1)
    expect(redacted.updatedAt).toBe(2)
    expect(redacted.multipleBirthGroup).toBe("twins")
    expect(redacted.isPlaceholder).toBe(true)
  })

  it("doesn't mutate the person it was given", () => {
    const original = { ...full }
    redactPerson(full)
    expect(full).toEqual(original)
  })
})

describe("redactPool", () => {
  const living = person("living", { givenName: "Nia", birth: { year: 1990 } })
  const dead = person("dead", {
    givenName: "Ada",
    birth: { year: 1815 },
    death: { year: 1852 },
  })

  it("redacts only the people who might be alive", () => {
    const result = redactPool([living, dead], [], options)

    expect([...result.redactedIds]).toEqual(["living"])
    expect(result.people.find((p) => p.id === "dead")?.givenName).toBe("Ada")
    expect(result.people.find((p) => p.id === "living")?.givenName).toBe(
      REDACTED_GIVEN_NAME
    )
  })

  // A hidden birth date beside a visible wedding date is the same information
  // arriving a different way.
  it("drops the dates from any relationship touching a redacted person", () => {
    const relationships: Relationship[] = [
      {
        id: "m1",
        type: "spouse",
        from: "living",
        to: "dead",
        start: { year: 2010 },
        end: { year: 2015 },
      },
      {
        id: "m2",
        type: "spouse",
        from: "dead",
        to: "other-dead",
        start: { year: 1840 },
      },
    ]

    const result = redactPool([living, dead], relationships, options)

    expect(result.relationships[0].start).toBeUndefined()
    expect(result.relationships[0].end).toBeUndefined()
    // A marriage between two people who are both long dead is untouched.
    expect(result.relationships[1].start).toEqual({ year: 1840 })
  })

  it("keeps the structure of every link", () => {
    const relationships: Relationship[] = [
      {
        id: "r",
        type: "parent-child",
        from: "dead",
        to: "living",
        subtype: "adopted",
      },
    ]

    const result = redactPool([living, dead], relationships, options)

    expect(result.relationships[0]).toMatchObject({
      type: "parent-child",
      from: "dead",
      to: "living",
      subtype: "adopted",
    })
  })

  it("returns the input untouched when nobody needs redacting", () => {
    const relationships: Relationship[] = []
    const result = redactPool([dead], relationships, options)

    expect(result.people[0]).toBe(dead)
    expect(result.relationships).toBe(relationships)
    expect(result.redactedIds.size).toBe(0)
  })
})

describe("countPresumedLiving and redactionNote", () => {
  it("counts who would be affected", () => {
    expect(
      countPresumedLiving(
        [
          person("a", { birth: { year: 1990 } }),
          person("b", { death: { year: 1900 } }),
          person("c"),
        ],
        options
      )
    ).toBe(2)
  })

  it("reads naturally for one person and for several", () => {
    expect(redactionNote(1)).toContain("1 person")
    expect(redactionNote(1)).toContain("has had")
    expect(redactionNote(4)).toContain("4 people")
    expect(redactionNote(4)).toContain("have had")
  })
})
