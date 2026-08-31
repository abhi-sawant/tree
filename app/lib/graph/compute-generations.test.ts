import { describe, expect, it } from "vitest"

import { computeGenerations } from "~/lib/graph/compute-generations"
import type { Person, Relationship } from "~/lib/types"

const id = () => crypto.randomUUID()

function person(): Person {
  const now = Date.now()
  return { id: id(), givenName: "Test", createdAt: now, updatedAt: now }
}

function parentChild(from: string, to: string): Relationship {
  return { id: id(), type: "parent-child", from, to }
}

function spouse(from: string, to: string): Relationship {
  return { id: id(), type: "spouse", from, to }
}

describe("computeGenerations", () => {
  it("assigns generation 0 to everyone with no parents", () => {
    const a = person()
    const b = person()
    const generations = computeGenerations([a, b], [])

    expect(generations.get(a.id)).toBe(0)
    expect(generations.get(b.id)).toBe(0)
  })

  it("assigns each generation one more than its parent", () => {
    const grandparent = person()
    const parentP = person()
    const child = person()
    const relationships = [
      parentChild(grandparent.id, parentP.id),
      parentChild(parentP.id, child.id),
    ]
    const generations = computeGenerations(
      [grandparent, parentP, child],
      relationships
    )

    expect(generations.get(grandparent.id)).toBe(0)
    expect(generations.get(parentP.id)).toBe(1)
    expect(generations.get(child.id)).toBe(2)
  })

  it("puts cousins from different branches at the same generation", () => {
    const grandparent = person()
    const parentA = person()
    const parentB = person()
    const cousinA = person()
    const cousinB = person()
    const relationships = [
      parentChild(grandparent.id, parentA.id),
      parentChild(grandparent.id, parentB.id),
      parentChild(parentA.id, cousinA.id),
      parentChild(parentB.id, cousinB.id),
    ]
    const generations = computeGenerations(
      [grandparent, parentA, parentB, cousinA, cousinB],
      relationships
    )

    expect(generations.get(cousinA.id)).toBe(generations.get(cousinB.id))
    expect(generations.get(cousinA.id)).toBe(2)
  })

  it("pins spouses to the same generation even when one married in from elsewhere", () => {
    const parentA = person()
    const child = person()
    const spouseFromOutside = person()
    const relationships = [
      parentChild(parentA.id, child.id),
      spouse(child.id, spouseFromOutside.id),
    ]
    const generations = computeGenerations(
      [parentA, child, spouseFromOutside],
      relationships
    )

    expect(generations.get(spouseFromOutside.id)).toBe(
      generations.get(child.id)
    )
  })

  it("takes the deepest ancestor chain when parents are at different generations", () => {
    const greatGrandparent = person()
    const grandparent = person()
    const parentP = person()
    const otherParent = person() // no ancestors of their own in this tree
    const child = person()
    const relationships = [
      parentChild(greatGrandparent.id, grandparent.id),
      parentChild(grandparent.id, parentP.id),
      parentChild(parentP.id, child.id),
      parentChild(otherParent.id, child.id),
    ]
    const generations = computeGenerations(
      [greatGrandparent, grandparent, parentP, otherParent, child],
      relationships
    )

    expect(generations.get(child.id)).toBe(3)
  })
})
