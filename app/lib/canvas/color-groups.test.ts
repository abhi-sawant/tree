import { describe, expect, it } from "vitest"

import { computeColorIndices } from "~/lib/canvas/color-groups"
import type { Person, Relationship } from "~/lib/types"

let clock = 0
function person(id: string, overrides: Partial<Person> = {}): Person {
  const now = ++clock
  return { id, givenName: id, createdAt: now, updatedAt: now, ...overrides }
}

function parentChild(from: string, to: string): Relationship {
  return { id: `${from}->${to}`, type: "parent-child", from, to }
}

describe("computeColorIndices — generation", () => {
  it("falls back to generation depth", () => {
    const people = [person("gp"), person("p"), person("c")]
    const relationships = [parentChild("gp", "p"), parentChild("p", "c")]
    const indices = computeColorIndices({
      people,
      relationships,
      mode: "generation",
    })
    expect(indices.get("gp")).toBe(0)
    expect(indices.get("p")).toBe(1)
    expect(indices.get("c")).toBe(2)
  })
})

describe("computeColorIndices — surname", () => {
  it("gives the commonest surname the first colour", () => {
    const people = [
      person("a", { familyName: "Zeta" }),
      person("b", { familyName: "Zeta" }),
      person("c", { familyName: "Alpha" }),
    ]
    const indices = computeColorIndices({
      people,
      relationships: [],
      mode: "surname",
    })
    expect(indices.get("a")).toBe(0)
    expect(indices.get("b")).toBe(0)
    expect(indices.get("c")).toBe(1)
  })

  it("breaks a frequency tie alphabetically", () => {
    const people = [
      person("z", { familyName: "Zeta" }),
      person("a", { familyName: "Alpha" }),
    ]
    const indices = computeColorIndices({
      people,
      relationships: [],
      mode: "surname",
    })
    expect(indices.get("a")).toBe(0)
    expect(indices.get("z")).toBe(1)
  })

  it("treats surnames differing only by case or spacing as one", () => {
    const people = [
      person("a", { familyName: "Reed" }),
      person("b", { familyName: " reed " }),
    ]
    const indices = computeColorIndices({
      people,
      relationships: [],
      mode: "surname",
    })
    expect(indices.get("a")).toBe(indices.get("b"))
  })

  it("puts everyone with no surname in one group after the named ones", () => {
    const people = [
      person("named", { familyName: "Reed" }),
      person("blank1"),
      person("blank2", { familyName: "  " }),
    ]
    const indices = computeColorIndices({
      people,
      relationships: [],
      mode: "surname",
    })
    expect(indices.get("named")).toBe(0)
    expect(indices.get("blank1")).toBe(1)
    expect(indices.get("blank2")).toBe(1)
  })
})

describe("computeColorIndices — branch", () => {
  // root -> b1, b2 (branch heads); b1 -> b1kid; b2 -> b2kid
  const people = [
    person("root"),
    person("b1"),
    person("b2"),
    person("b1kid"),
    person("b2kid"),
    person("outsider"),
  ]
  const relationships = [
    parentChild("root", "b1"),
    parentChild("root", "b2"),
    parentChild("b1", "b1kid"),
    parentChild("b2", "b2kid"),
  ]

  function indices(rootPersonId?: string) {
    return computeColorIndices({
      people,
      relationships,
      mode: "branch",
      rootPersonId,
    })
  }

  it("gives each of the root's children their own colour", () => {
    const result = indices("root")
    expect(result.get("b1")).toBe(0)
    expect(result.get("b2")).toBe(1)
  })

  it("colours a descendant with their branch", () => {
    const result = indices("root")
    expect(result.get("b1kid")).toBe(result.get("b1"))
    expect(result.get("b2kid")).toBe(result.get("b2"))
  })

  it("puts the root and anyone unconnected in a final shared group", () => {
    // Neither belongs to a single branch, so neither should borrow a branch's
    // colour and imply they do.
    const result = indices("root")
    expect(result.get("root")).toBe(2)
    expect(result.get("outsider")).toBe(2)
  })

  it("falls back to one group when there is no root", () => {
    const result = indices(undefined)
    expect(new Set(result.values())).toEqual(new Set([0]))
  })

  it("assigns a person reachable from two branches deterministically", () => {
    // A cousin marriage puts one child under both branches; the earlier branch
    // wins, so the colouring at least doesn't flicker between recomputes.
    const cousinPeople = [...people, person("shared")]
    const cousinRels = [
      ...relationships,
      parentChild("b1kid", "shared"),
      parentChild("b2kid", "shared"),
    ]
    const first = computeColorIndices({
      people: cousinPeople,
      relationships: cousinRels,
      mode: "branch",
      rootPersonId: "root",
    })
    const second = computeColorIndices({
      people: cousinPeople,
      relationships: cousinRels,
      mode: "branch",
      rootPersonId: "root",
    })
    expect(first.get("shared")).toBe(0)
    expect(first).toEqual(second)
  })

  it("covers every person in every mode", () => {
    for (const mode of ["generation", "surname", "branch"] as const) {
      const result = computeColorIndices({
        people,
        relationships,
        mode,
        rootPersonId: "root",
      })
      for (const p of people) expect(result.has(p.id)).toBe(true)
    }
  })
})
