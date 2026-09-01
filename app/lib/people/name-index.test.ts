import { describe, expect, it } from "vitest"

import { NameIndex, normalizeName } from "~/lib/people/name-index"
import type { Person } from "~/lib/types"

function person(id: string, extra: Partial<Person> = {}): Person {
  return { id, givenName: id, createdAt: 0, updatedAt: 0, ...extra }
}

const arjun = person("p1", { givenName: "Arjun", familyName: "Sawant" })
const priya = person("p2", {
  givenName: "Priya",
  familyName: "Iyer",
  nickname: "Pri",
})

describe("normalizeName", () => {
  it("ignores case and runs of whitespace", () => {
    expect(normalizeName("  Arjun   SAWANT ")).toBe("arjun sawant")
  })
})

describe("NameIndex", () => {
  const index = new NameIndex([arjun, priya])

  it("resolves a plain given-and-family name", () => {
    expect(index.resolve("Arjun Sawant")).toEqual({ ok: true, id: "p1" })
  })

  it("ignores case and spacing", () => {
    expect(index.resolve("  arjun   sawant ")).toEqual({ ok: true, id: "p1" })
  })

  // The CSV export writes the display name, nickname and all, so a file this
  // app produced has to resolve against itself.
  it("resolves the display form with a quoted nickname", () => {
    expect(index.resolve("Priya “Pri” Iyer")).toEqual({ ok: true, id: "p2" })
  })

  // And a person's own spreadsheet, or a note someone types, will use the
  // plain form.
  it("resolves the plain form of someone who has a nickname", () => {
    expect(index.resolve("Priya Iyer")).toEqual({ ok: true, id: "p2" })
  })

  it("resolves an exact id", () => {
    expect(index.resolve("p1")).toEqual({ ok: true, id: "p1" })
  })

  // Different answers because they need different responses: one is a typo to
  // fix, the other a choice only the reader can make.
  it("separates a name nobody has from a name several people share", () => {
    expect(index.resolve("Nobody At All")).toMatchObject({
      ok: false,
      reason: "missing",
    })

    const twins = new NameIndex([
      arjun,
      person("p3", { givenName: "Arjun", familyName: "Sawant" }),
    ])
    expect(twins.resolve("Arjun Sawant")).toMatchObject({
      ok: false,
      reason: "ambiguous",
      matches: ["p1", "p3"],
    })
  })

  it("resolves someone with no family name", () => {
    const solo = new NameIndex([person("p4", { givenName: "Kiran" })])
    expect(solo.resolve("Kiran")).toEqual({ ok: true, id: "p4" })
  })

  it("finds nothing in an empty pool", () => {
    expect(new NameIndex().resolve("Anyone")).toMatchObject({
      ok: false,
      reason: "missing",
    })
  })

  // The same person added twice must not look like two people.
  it("does not report a person as ambiguous with themselves", () => {
    const index = new NameIndex([arjun])
    index.add(arjun)
    expect(index.resolve("Arjun Sawant")).toEqual({ ok: true, id: "p1" })
  })
})
