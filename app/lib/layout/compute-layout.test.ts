import type { ElkExtendedEdge, ElkNode } from "elkjs"
import { describe, expect, it } from "vitest"

import { PERSON_WIDTH, toElkGraph } from "~/lib/graph/to-elk-graph"
import { computeLayout } from "~/lib/layout/compute-layout"
import type { Person, Relationship, TreeMember } from "~/lib/types"

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

function member(treeId: string, personId: string): TreeMember {
  return { treeId, personId }
}

function parentChild(from: string, to: string): Relationship {
  return { id: id(), type: "parent-child", from, to }
}

function spouse(from: string, to: string): Relationship {
  return { id: id(), type: "spouse", from, to }
}

function node(id: string, width = 160, height = 80): ElkNode {
  return { id, width, height }
}

function edge(id: string, source: string, target: string): ElkExtendedEdge {
  return { id, sources: [source], targets: [target] }
}

describe("computeLayout", () => {
  it("assigns a position to every input node", async () => {
    const graph: ElkNode = {
      id: "root",
      children: [node("a"), node("b"), node("c")],
      edges: [edge("e1", "a", "b"), edge("e2", "b", "c")],
    }

    const positions = await computeLayout(graph)

    expect(Object.keys(positions).sort()).toEqual(["a", "b", "c"])
    for (const pos of Object.values(positions)) {
      expect(typeof pos.x).toBe("number")
      expect(typeof pos.y).toBe("number")
    }
  })

  it("places two siblings sharing a union child at different x positions", async () => {
    const graph: ElkNode = {
      id: "root",
      children: [
        node("person:a"),
        node("person:b"),
        node("union:a:b", 16, 16),
        node("person:child"),
      ],
      edges: [
        edge("e1", "person:a", "union:a:b"),
        edge("e2", "person:b", "union:a:b"),
        edge("e3", "union:a:b", "person:child"),
      ],
    }

    const positions = await computeLayout(graph)

    expect(positions["person:a"].x).not.toEqual(positions["person:b"].x)
    // Same generation ends up in the same layer (equal y under top-down layered layout).
    expect(positions["person:a"].y).toEqual(positions["person:b"].y)
    expect(positions["person:child"].y).toBeGreaterThan(positions["union:a:b"].y)
  })

  it("keeps a neighboring couple's union from drifting into a wider family's children columns", async () => {
    const treeId = id()
    const grandparent = person()
    const a = person()
    const b = person()
    const child1 = person()
    const child1Spouse = person()
    const child2 = person()
    const c = person()
    const d = person()
    const child3 = person()
    const child3Spouse = person()
    const people = [
      grandparent,
      a,
      b,
      child1,
      child1Spouse,
      child2,
      c,
      d,
      child3,
      child3Spouse,
    ]

    // grandparent's two children (a, c) each marry in. a+b have TWO children
    // (child1, who also has a spouse, and child2, who doesn't) — 3 columns
    // of descendants. c+d have only ONE child (child3, with a spouse) — 2
    // columns. A union's ELK width must reflect that wider footprint, or
    // c+d's narrower union can end up positioned over a+b's children instead
    // of its own (the reported "lines getting mixed up" bug).
    const graph = toElkGraph({
      people,
      relationships: [
        parentChild(grandparent.id, a.id),
        parentChild(grandparent.id, c.id),
        spouse(a.id, b.id),
        parentChild(a.id, child1.id),
        parentChild(b.id, child1.id),
        spouse(child1.id, child1Spouse.id),
        parentChild(a.id, child2.id),
        parentChild(b.id, child2.id),
        spouse(c.id, d.id),
        parentChild(c.id, child3.id),
        parentChild(d.id, child3.id),
        spouse(child3.id, child3Spouse.id),
      ],
      treeMembers: people.map((p) => member(treeId, p.id)),
    })

    const positions = await computeLayout(graph)

    const rightEdge = (personId: string) =>
      positions[`person:${personId}`].x + PERSON_WIDTH

    const abChildrenSpanEnd = Math.max(
      rightEdge(child1.id),
      rightEdge(child1Spouse.id),
      rightEdge(child2.id)
    )

    const unionCdId = graph
      .children!.filter((n) => n.id.startsWith("union:"))
      .map((n) => n.id)
      .find((unionId) => unionId.includes(c.id) && unionId.includes(d.id))!

    expect(positions[unionCdId].x).toBeGreaterThanOrEqual(abChildrenSpanEnd)
  })
})
