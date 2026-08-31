import { describe, expect, it } from "vitest"

import { deriveUnions } from "~/lib/graph/derive-unions"
import { orderFamilyGraph } from "~/lib/graph/order-family-graph"
import type { Person, Relationship } from "~/lib/types"

const id = () => crypto.randomUUID()
let clock = 0
const nextCreatedAt = () => ++clock

function person(overrides: Partial<Person> = {}): Person {
  const now = nextCreatedAt()
  return {
    id: id(),
    givenName: "Test",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function parentChild(from: string, to: string): Relationship {
  return { id: id(), type: "parent-child", from, to }
}

function spouse(from: string, to: string): Relationship {
  return { id: id(), type: "spouse", from, to }
}

function indexOf(order: string[], personId: string): number {
  const i = order.indexOf(personId)
  expect(i).toBeGreaterThanOrEqual(0)
  return i
}

describe("orderFamilyGraph", () => {
  it("keeps each of two sibling unions' children contiguous in the same generation", () => {
    const grandparent = person()
    const a = person()
    const b = person()
    const c = person()
    const d = person()
    const child1 = person()
    const child2 = person()
    const child3 = person()
    const child4 = person()

    const relationships: Relationship[] = [
      parentChild(grandparent.id, a.id),
      parentChild(grandparent.id, c.id),
      spouse(a.id, b.id),
      parentChild(a.id, child1.id),
      parentChild(b.id, child1.id),
      parentChild(a.id, child2.id),
      parentChild(b.id, child2.id),
      spouse(c.id, d.id),
      parentChild(c.id, child3.id),
      parentChild(d.id, child3.id),
      parentChild(c.id, child4.id),
      parentChild(d.id, child4.id),
    ]
    const people = [grandparent, a, b, c, d, child1, child2, child3, child4]
    const { unions, singleParentLinks, twoParentLinks } = deriveUnions(
      people,
      relationships
    )

    const { personOrder } = orderFamilyGraph(
      people,
      unions,
      singleParentLinks,
      twoParentLinks
    )

    expect(personOrder).toHaveLength(people.length)
    expect(new Set(personOrder).size).toBe(people.length)

    const i1 = indexOf(personOrder, child1.id)
    const i2 = indexOf(personOrder, child2.id)
    expect(Math.abs(i1 - i2)).toBe(1)

    const i3 = indexOf(personOrder, child3.id)
    const i4 = indexOf(personOrder, child4.id)
    expect(Math.abs(i3 - i4)).toBe(1)
  })

  it("keeps half-siblings from two different unions from interleaving", () => {
    const x = person()
    const a = person()
    const b = person()
    const c1 = person()
    const c2 = person()
    const c3 = person()
    const c4 = person()

    const relationships: Relationship[] = [
      spouse(x.id, a.id),
      parentChild(x.id, c1.id),
      parentChild(a.id, c1.id),
      parentChild(x.id, c2.id),
      parentChild(a.id, c2.id),
      spouse(x.id, b.id),
      parentChild(x.id, c3.id),
      parentChild(b.id, c3.id),
      parentChild(x.id, c4.id),
      parentChild(b.id, c4.id),
    ]
    const people = [x, a, b, c1, c2, c3, c4]
    const { unions, singleParentLinks, twoParentLinks } = deriveUnions(
      people,
      relationships
    )

    const { personOrder } = orderFamilyGraph(
      people,
      unions,
      singleParentLinks,
      twoParentLinks
    )

    expect(personOrder).toHaveLength(people.length)
    expect(new Set(personOrder).size).toBe(people.length)

    const i1 = indexOf(personOrder, c1.id)
    const i2 = indexOf(personOrder, c2.id)
    expect(Math.abs(i1 - i2)).toBe(1)

    const i3 = indexOf(personOrder, c3.id)
    const i4 = indexOf(personOrder, c4.id)
    expect(Math.abs(i3 - i4)).toBe(1)

    // Neither pair is split by the other: the two sibling runs don't overlap.
    const group1 = [i1, i2].sort((n1, n2) => n1 - n2)
    const group2 = [i3, i4].sort((n1, n2) => n1 - n2)
    const overlaps = group1[0] < group2[1] && group2[0] < group1[1]
    expect(overlaps).toBe(false)
  })

  it("covers disconnected family components fully, with no clear single root, and is deterministic", () => {
    const familyA = { parent: person(), child: person() }
    const familyB = { parent: person(), child: person() }
    const isolated = person()

    const relationships: Relationship[] = [
      parentChild(familyA.parent.id, familyA.child.id),
      parentChild(familyB.parent.id, familyB.child.id),
    ]
    const people = [
      familyA.parent,
      familyA.child,
      familyB.parent,
      familyB.child,
      isolated,
    ]
    const { unions, singleParentLinks, twoParentLinks } = deriveUnions(
      people,
      relationships
    )

    const first = orderFamilyGraph(
      people,
      unions,
      singleParentLinks,
      twoParentLinks
    )
    const second = orderFamilyGraph(
      people,
      unions,
      singleParentLinks,
      twoParentLinks
    )

    expect(new Set(first.personOrder).size).toBe(people.length)
    expect(first.personOrder).toHaveLength(people.length)
    expect(first.personOrder).toEqual(second.personOrder)
    expect(first.unionOrder).toEqual(second.unionOrder)
  })

  it("visits every person exactly once even across a cousin marriage (cyclic DAG)", () => {
    const grandparent = person()
    const p1 = person()
    const p2 = person()
    const x = person()
    const y = person()
    const z = person()

    const relationships: Relationship[] = [
      parentChild(grandparent.id, p1.id),
      parentChild(grandparent.id, p2.id),
      parentChild(p1.id, x.id),
      parentChild(p2.id, y.id),
      spouse(x.id, y.id),
      parentChild(x.id, z.id),
      parentChild(y.id, z.id),
    ]
    const people = [grandparent, p1, p2, x, y, z]
    const { unions, singleParentLinks, twoParentLinks } = deriveUnions(
      people,
      relationships
    )

    const { personOrder } = orderFamilyGraph(
      people,
      unions,
      singleParentLinks,
      twoParentLinks
    )

    expect(personOrder).toHaveLength(people.length)
    expect(new Set(personOrder).size).toBe(people.length)
  })

  it("still orders a childless spouse-only union's parents, even with no children to anchor it", () => {
    const a = person()
    const b = person()

    const relationships: Relationship[] = [spouse(a.id, b.id)]
    const people = [a, b]
    const { unions, singleParentLinks, twoParentLinks } = deriveUnions(
      people,
      relationships
    )

    const { personOrder, unionOrder } = orderFamilyGraph(
      people,
      unions,
      singleParentLinks,
      twoParentLinks
    )

    expect(unionOrder).toEqual([unions[0].id])
    expect(new Set(personOrder)).toEqual(new Set([a.id, b.id]))
  })
})

describe("orderFamilyGraph multiple births", () => {
  // Three siblings recorded in the order twin1, middle, twin2 — so the plain
  // createdAt sort would wedge `middle` between the two twins.
  function threeSiblings(twinToken?: string) {
    const mother = person()
    const father = person()
    const twin1 = person({ multipleBirthGroup: twinToken })
    const middle = person()
    const twin2 = person({ multipleBirthGroup: twinToken })
    const people = [mother, father, twin1, middle, twin2]
    const relationships = [
      spouse(mother.id, father.id),
      ...[twin1, middle, twin2].flatMap((child) => [
        parentChild(mother.id, child.id),
        parentChild(father.id, child.id),
      ]),
    ]
    const { unions, singleParentLinks, twoParentLinks } = deriveUnions(
      people,
      relationships
    )
    const { personOrder } = orderFamilyGraph(
      people,
      unions,
      singleParentLinks,
      twoParentLinks
    )
    return { personOrder, twin1, twin2, middle }
  }

  it("keeps twins adjacent even when a sibling was recorded between them", () => {
    const { personOrder, twin1, twin2 } = threeSiblings("birth-1")
    expect(
      Math.abs(indexOf(personOrder, twin1.id) - indexOf(personOrder, twin2.id))
    ).toBe(1)
  })

  it("anchors the pair where its earliest member would have sorted", () => {
    // twin1 was recorded first of the three, so the block still leads and
    // `middle` keeps its position after them rather than being pushed around.
    const { personOrder, twin1, twin2, middle } = threeSiblings("birth-1")
    expect(indexOf(personOrder, twin1.id)).toBeLessThan(
      indexOf(personOrder, twin2.id)
    )
    expect(indexOf(personOrder, twin2.id)).toBeLessThan(
      indexOf(personOrder, middle.id)
    )
  })

  it("leaves ordering untouched when nobody is in a group", () => {
    const { personOrder, twin1, twin2, middle } = threeSiblings(undefined)
    expect(indexOf(personOrder, twin1.id)).toBeLessThan(
      indexOf(personOrder, middle.id)
    )
    expect(indexOf(personOrder, middle.id)).toBeLessThan(
      indexOf(personOrder, twin2.id)
    )
  })

  it("keeps two separate multiple births apart from each other", () => {
    const mother = person()
    const twinA1 = person({ multipleBirthGroup: "g1" })
    const twinB1 = person({ multipleBirthGroup: "g2" })
    const twinA2 = person({ multipleBirthGroup: "g1" })
    const twinB2 = person({ multipleBirthGroup: "g2" })
    const kids = [twinA1, twinB1, twinA2, twinB2]
    const people = [mother, ...kids]
    const relationships = kids.map((child) => parentChild(mother.id, child.id))
    const { unions, singleParentLinks, twoParentLinks } = deriveUnions(
      people,
      relationships
    )
    const { personOrder } = orderFamilyGraph(
      people,
      unions,
      singleParentLinks,
      twoParentLinks
    )
    expect(
      Math.abs(
        indexOf(personOrder, twinA1.id) - indexOf(personOrder, twinA2.id)
      )
    ).toBe(1)
    expect(
      Math.abs(
        indexOf(personOrder, twinB1.id) - indexOf(personOrder, twinB2.id)
      )
    ).toBe(1)
  })
})
