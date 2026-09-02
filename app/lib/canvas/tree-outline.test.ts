import { describe, expect, it } from "vitest"

import {
  buildTreeOutline,
  outlinePersonCount,
  type OutlineEntry,
} from "~/lib/canvas/tree-outline"
import { sampleTreeData } from "~/lib/demo/sample-tree"
import type { Person, Relationship } from "~/lib/types"

const sample = sampleTreeData(1_700_000_000_000)

function outlineOf(
  people: Person[],
  relationships: Relationship[],
  memberIds: string[] = people.map((person) => person.id)
): OutlineEntry[] {
  return buildTreeOutline({
    people,
    relationships,
    memberIds: new Set(memberIds),
  })
}

// A shape that can be compared at a glance, and read out loud in the order the
// list is walked.
function sketch(entries: OutlineEntry[], depth = 0): string[] {
  return entries.flatMap((entry) => [
    `${"  ".repeat(depth)}${entry.relation}: ${entry.personId}${
      entry.qualifiers.length ? ` (${entry.qualifiers.join("; ")})` : ""
    }`,
    ...sketch(entry.children, depth + 1),
  ])
}

function person(
  id: string,
  createdAt: number,
  extra: Partial<Person> = {}
): Person {
  return { id, givenName: id, createdAt, updatedAt: createdAt, ...extra }
}

describe("buildTreeOutline over the sample family", () => {
  const outline = outlineOf(sample.people, sample.relationships)

  it("descends from the one person with no parents in the tree", () => {
    expect(outline).toHaveLength(1)
    expect(outline[0]).toMatchObject({ personId: "demo-p1", relation: "start" })
  })

  // The whole point of the feature in one assertion: the shape a screen reader
  // walks. Spouses nest under their partner, children under the couple, in the
  // order the canvas draws them.
  it("reads as generations of descent", () => {
    expect(sketch(outline)).toEqual([
      "start: demo-p1",
      "  spouse: demo-p2 (married 1911)",
      "    child: demo-p3",
      "      spouse: demo-p4 (married 1943)",
      "        child: demo-p7",
      "          spouse: demo-p10 (married 1969; marriage ended)",
      "            child: demo-p13",
      "            child: demo-p14",
      "          spouse: demo-p11 (married 1985)",
      "        child: demo-p8",
      "          spouse: demo-p12 (married 1975)",
      "            child: demo-p15 (adopted)",
      "        child: demo-p9",
      "    child: demo-p5",
      "      spouse: demo-p6 (married 1940)",
    ])
  })

  it("names everybody exactly once", () => {
    const flat = sketch(outline)
    expect(outlinePersonCount(outline)).toBe(sample.people.length)
    expect(flat).toHaveLength(sample.people.length)
  })

  it("introduces a person the same way their card does", () => {
    expect(outline[0].label).toBe("Ravi Sawant, 12 Mar 1888 – 4 Nov 1961")
    const sushila = outline[0].children[0]
    expect(sushila.label).toBe("Sushila Sawant, c. 1892 – 1978")
    // Somebody still living has a birth and no death.
    const meera = sushila.children[0].children[0].children[0]
    expect(meera.label).toBe("Meera Nair, born 14 Sep 1946")
  })
})

describe("buildTreeOutline edge cases", () => {
  it("scopes to the tree's members, ignoring links that leave it", () => {
    const people = [person("a", 1), person("b", 2), person("outsider", 3)]
    const relationships: Relationship[] = [
      { id: "r1", type: "parent-child", from: "a", to: "b" },
      { id: "r2", type: "parent-child", from: "outsider", to: "b" },
    ]

    // With the outsider off the canvas, "b" has one parent in the tree and
    // hangs off them directly.
    expect(sketch(outlineOf(people, relationships, ["a", "b"]))).toEqual([
      "start: a",
      "  child: b",
    ])
  })

  // Whichever way round the traversal reaches them, somebody is expanded once
  // and merely named the second time. Which of the two places gets the
  // expansion follows the same rule the canvas does — orderFamilyGraph puts
  // whoever is reached second beside their spouse rather than inside their own
  // birth family — so the list and the picture agree even here.
  it("names a person reached twice without expanding them again", () => {
    // A cousin marriage: two grandchildren of the same couple marry, so the
    // second one is reachable both as a child and as a spouse.
    const people = [
      person("gran", 1),
      person("gramps", 2),
      person("son", 3),
      person("daughter", 4),
      person("grandson", 5),
      person("granddaughter", 6),
    ]
    const relationships: Relationship[] = [
      { id: "m1", type: "spouse", from: "gran", to: "gramps" },
      { id: "p1", type: "parent-child", from: "gran", to: "son" },
      { id: "p2", type: "parent-child", from: "gramps", to: "son" },
      { id: "p3", type: "parent-child", from: "gran", to: "daughter" },
      { id: "p4", type: "parent-child", from: "gramps", to: "daughter" },
      { id: "p5", type: "parent-child", from: "son", to: "grandson" },
      { id: "p6", type: "parent-child", from: "daughter", to: "granddaughter" },
      { id: "m2", type: "spouse", from: "grandson", to: "granddaughter" },
    ]

    expect(sketch(outlineOf(people, relationships))).toEqual([
      "start: gran",
      "  spouse: gramps",
      "    child: son",
      "      child: grandson",
      "        spouse: granddaughter",
      "    child: daughter",
      "      child: granddaughter (listed again — their family is above)",
    ])
    // Named twice, counted once — and the reader still learns who
    // daughter's child is without the list looping.
    expect(outlinePersonCount(outlineOf(people, relationships))).toBe(6)
  })

  it("gives a member nothing else reaches a top-level entry of their own", () => {
    const people = [person("a", 1), person("stranger", 2)]
    expect(sketch(outlineOf(people, []))).toEqual([
      "start: a",
      "start: stranger",
    ])
  })

  it("keeps twins together and in the order they were recorded", () => {
    const people = [
      person("mum", 1),
      person("elder", 2),
      person("twin-a", 3, { multipleBirthGroup: "t" }),
      person("middle", 4),
      person("twin-b", 5, { multipleBirthGroup: "t" }),
    ]
    const relationships: Relationship[] = [
      "elder",
      "twin-a",
      "middle",
      "twin-b",
    ].map((childId, i) => ({
      id: `r${i}`,
      type: "parent-child" as const,
      from: "mum",
      to: childId,
    }))

    expect(sketch(outlineOf(people, relationships))).toEqual([
      "start: mum",
      "  child: elder",
      "  child: twin-a",
      "  child: twin-b",
      "  child: middle",
    ])
  })

  it("says when a parent-child link isn't by birth", () => {
    const people = [person("parent", 1), person("child", 2)]
    const relationships: Relationship[] = [
      {
        id: "r1",
        type: "parent-child",
        from: "parent",
        to: "child",
        subtype: "foster",
      },
    ]
    expect(sketch(outlineOf(people, relationships))).toEqual([
      "start: parent",
      "  child: child (foster)",
    ])
  })

  it("says nothing extra about a biological link", () => {
    const people = [person("parent", 1), person("child", 2)]
    const relationships: Relationship[] = [
      {
        id: "r1",
        type: "parent-child",
        from: "parent",
        to: "child",
        subtype: "biological",
      },
    ]
    expect(outlineOf(people, relationships)[0].children[0].qualifiers).toEqual(
      []
    )
  })

  it("is empty for an empty tree", () => {
    expect(outlineOf([], [])).toEqual([])
    expect(outlinePersonCount([])).toBe(0)
  })
})
