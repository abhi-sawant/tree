import { describe, expect, it } from "vitest"

import {
  buildFamilyBook,
  type BuildFamilyBookInput,
} from "~/lib/export/family-book"
import type { Person, Relationship } from "~/lib/types"

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    givenName: id,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function book(overrides: Partial<BuildFamilyBookInput> = {}) {
  return buildFamilyBook({
    title: "Sawant Family",
    people: [],
    relationships: [],
    generations: new Map(),
    ...overrides,
  })
}

const parentOf = (
  from: string,
  to: string,
  extra: Partial<Relationship> = {}
): Relationship => ({
  id: `${from}->${to}`,
  type: "parent-child",
  from,
  to,
  ...extra,
})

describe("scope", () => {
  it("makes one page per person in scope", () => {
    const result = book({ people: [person("a"), person("b"), person("c")] })

    expect(result.pages).toHaveLength(3)
  })

  it("produces an empty book rather than failing on an empty pool", () => {
    expect(book().pages).toEqual([])
  })
})

describe("ordering", () => {
  it("reads oldest generation first, then by birth date, then by name", () => {
    const people = [
      person("young-b", { givenName: "Bea", birth: { year: 1950 } }),
      person("young-a", { givenName: "Ada", birth: { year: 1950 } }),
      person("younger", { givenName: "Cy", birth: { year: 1980 } }),
      person("elder", { givenName: "Zoe", birth: { year: 1900 } }),
    ]
    const generations = new Map([
      ["elder", 0],
      ["young-a", 1],
      ["young-b", 1],
      ["younger", 2],
    ])

    const result = book({ people, generations })

    expect(result.pages.map((p) => p.personId)).toEqual([
      "elder",
      "young-a",
      "young-b",
      "younger",
    ])
  })

  // Possible when the caller passes people the generation map doesn't cover.
  // Treating them as generation zero would put them in front of the eldest.
  it("puts someone with no generation number after everyone who has one", () => {
    const result = book({
      people: [person("stray"), person("known")],
      generations: new Map([["known", 5]]),
    })

    expect(result.pages.map((p) => p.personId)).toEqual(["known", "stray"])
  })
})

describe("a person's page", () => {
  it("assembles the name, aliases, lifespan and facts", () => {
    const result = book({
      people: [
        person("a", {
          givenName: "Ada",
          familyName: "Lovelace",
          maidenName: "Byron",
          nickname: "Addy",
          sex: "female",
          birth: { year: 1815, month: 12, day: 10 },
          death: { year: 1852 },
          customFields: [{ label: "Occupation", value: "Mathematician" }],
        }),
      ],
    })

    const page = result.pages[0]
    expect(page.name).toBe("Ada “Addy” Lovelace")
    expect(page.alsoKnownAs).toBe("“Addy”, née Byron")
    expect(page.lifespan).toBe("10 Dec 1815 – 1852")
    expect(page.facts).toEqual([
      { label: "Born", value: "10 Dec 1815" },
      { label: "Died", value: "1852" },
      { label: "Sex", value: "Female" },
      { label: "Occupation", value: "Mathematician" },
    ])
  })

  it("says so plainly when neither date is recorded", () => {
    expect(book({ people: [person("a")] }).pages[0].lifespan).toBe(
      "Dates unrecorded"
    )
  })

  it("leaves out the alias line when there is nothing to say", () => {
    const result = book({
      people: [
        person("a", {
          givenName: "Ada",
          familyName: "Byron",
          maidenName: "Byron",
        }),
      ],
    })

    expect(result.pages[0].alsoKnownAs).toBeUndefined()
  })

  it("lists parents, spouses, siblings and children with their dates", () => {
    const people = [
      person("child", { givenName: "Cy" }),
      person("sib", { givenName: "Sam", birth: { year: 1950 } }),
      person("mum", {
        givenName: "Mia",
        birth: { year: 1920 },
        death: { year: 1990 },
      }),
      person("dad", { givenName: "Dan", birth: { year: 1918 } }),
      person("wife", { givenName: "Wen" }),
      person("kid", { givenName: "Kit" }),
    ]
    const relationships: Relationship[] = [
      parentOf("mum", "child"),
      parentOf("dad", "child"),
      parentOf("mum", "sib"),
      parentOf("child", "kid"),
      {
        id: "m",
        type: "spouse",
        from: "child",
        to: "wife",
        start: { year: 1975 },
        end: { year: 1990 },
      },
    ]

    const page = book({ people, relationships }).pages.find(
      (p) => p.personId === "child"
    )!

    expect(page.relations.map((g) => g.heading)).toEqual([
      "Parents",
      "Spouse",
      "Siblings",
      "Children",
    ])
    expect(page.relations[0].entries).toEqual([
      { personId: "dad", name: "Dan", detail: "b. 1918" },
      { personId: "mum", name: "Mia", detail: "1920–1990" },
    ])
    expect(page.relations[1].entries[0].detail).toBe("m. 1975, until 1990")
    expect(page.relations[2].entries[0]).toMatchObject({ name: "Sam" })
  })

  it("names how a parent-child link came about when it isn't biological", () => {
    const people = [
      person("kid", { givenName: "Kit" }),
      person("p", { givenName: "Pat" }),
    ]
    const relationships = [parentOf("p", "kid", { subtype: "adopted" })]

    const page = book({ people, relationships }).pages.find(
      (p) => p.personId === "kid"
    )!

    expect(page.relations[0].entries[0].detail).toBe("adopted")
  })

  it("says nothing extra for a biological link", () => {
    const people = [person("kid"), person("p")]
    const relationships = [parentOf("p", "kid", { subtype: "biological" })]

    const page = book({ people, relationships }).pages.find(
      (p) => p.personId === "kid"
    )!

    expect(page.relations[0].entries[0].detail).toBeUndefined()
  })

  // Leaving them out would make the page say someone had one parent when the
  // record says two.
  it("still names a relative who has no page in this book", () => {
    const relationships = [parentOf("outsider", "kid")]

    const page = book({ people: [person("kid")], relationships }).pages[0]

    expect(page.relations[0].entries[0]).toEqual({
      personId: undefined,
      name: "Not in this book",
      detail: undefined,
    })
  })

  it("flattens the note, dropping markers and link brackets", () => {
    const result = book({
      people: [
        person("a", {
          notes: "# Life\n\nWorked with **[[Ada Lovelace]]**.\n\n- one\n- two",
        }),
      ],
    })

    expect(result.pages[0].notes).toEqual([
      "Life",
      "Worked with Ada Lovelace.",
      "• one",
      "• two",
    ])
  })

  it("lists document names against the person they belong to", () => {
    const result = book({
      people: [person("a")],
      documentNames: new Map([["a", ["Birth certificate.pdf"]]]),
    })

    expect(result.pages[0].documents).toEqual(["Birth certificate.pdf"])
  })

  it("carries the cover photo, including from the legacy field", () => {
    const result = book({
      people: [
        person("a", { photoIds: ["cover", "other"] }),
        person("b", { photoId: "old" }),
      ],
    })

    const byId = new Map(result.pages.map((p) => [p.personId, p.coverPhotoId]))
    expect(byId.get("a")).toBe("cover")
    expect(byId.get("b")).toBe("old")
  })
})

// A book that quietly skipped them would misrepresent how complete it is.
describe("bareCount", () => {
  it("counts pages that carry nothing but a name", () => {
    const result = book({
      people: [person("bare"), person("known", { birth: { year: 1900 } })],
    })

    expect(result.bareCount).toBe(1)
  })

  it("doesn't count someone whose only content is a relative", () => {
    const result = book({
      people: [person("a"), person("b")],
      relationships: [parentOf("a", "b")],
    })

    expect(result.bareCount).toBe(0)
  })
})
