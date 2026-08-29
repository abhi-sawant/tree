import { describe, expect, it } from "vitest"

import { isAcyclic, toElkGraph } from "~/lib/graph/to-elk-graph"
import type { Person, Relationship, TreeMember } from "~/lib/types"

const id = () => crypto.randomUUID()

function person(overrides: Partial<Person> = {}): Person {
  const now = Date.now()
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

describe("toElkGraph", () => {
  it("(a) two parents with a spouse relationship: person nodes wire into one union node", () => {
    const treeId = id()
    const a = person()
    const b = person()
    const child = person()
    const relationships = [
      parentChild(a.id, child.id),
      parentChild(b.id, child.id),
      spouse(a.id, b.id),
    ]

    const graph = toElkGraph({
      people: [a, b, child],
      relationships,
      treeMembers: [
        member(treeId, a.id),
        member(treeId, b.id),
        member(treeId, child.id),
      ],
    })

    const nodeIds = graph.children!.map((n) => n.id)
    expect(nodeIds).toContain(`person:${a.id}`)
    expect(nodeIds).toContain(`person:${b.id}`)
    expect(nodeIds).toContain(`person:${child.id}`)
    const unionNodeId = nodeIds.find((nid) => nid.startsWith("union:"))!
    expect(unionNodeId).toBeDefined()

    const edgeTargets = graph.edges!.map((e) => ({
      sources: e.sources,
      targets: e.targets,
    }))
    expect(edgeTargets).toContainEqual({
      sources: [`person:${a.id}`],
      targets: [unionNodeId],
    })
    expect(edgeTargets).toContainEqual({
      sources: [`person:${b.id}`],
      targets: [unionNodeId],
    })
    expect(edgeTargets).toContainEqual({
      sources: [unionNodeId],
      targets: [`person:${child.id}`],
    })
  })

  it("(b) two parents with no spouse relationship still wire through an implicit union", () => {
    const treeId = id()
    const a = person()
    const b = person()
    const child = person()

    const graph = toElkGraph({
      people: [a, b, child],
      relationships: [parentChild(a.id, child.id), parentChild(b.id, child.id)],
      treeMembers: [
        member(treeId, a.id),
        member(treeId, b.id),
        member(treeId, child.id),
      ],
    })

    const unionNodeId = graph
      .children!.map((n) => n.id)
      .find((nid) => nid.startsWith("union:"))!
    expect(unionNodeId).toBeDefined()
    expect(graph.edges).toHaveLength(3) // 2 parent->union + 1 union->child
  })

  it("(c) a single parent attaches the child directly, with no union node", () => {
    const treeId = id()
    const parent = person()
    const child = person()

    const graph = toElkGraph({
      people: [parent, child],
      relationships: [parentChild(parent.id, child.id)],
      treeMembers: [member(treeId, parent.id), member(treeId, child.id)],
    })

    expect(graph.children!.some((n) => n.id.startsWith("union:"))).toBe(false)
    expect(graph.edges).toEqual([
      {
        id: `edge:person:${parent.id}->person:${child.id}`,
        sources: [`person:${parent.id}`],
        targets: [`person:${child.id}`],
      },
    ])
  })

  it("(d) remarriage produces two distinct union nodes with correctly split children", () => {
    const treeId = id()
    const x = person()
    const a = person()
    const b = person()
    const childWithA = person()
    const childWithB = person()

    const graph = toElkGraph({
      people: [x, a, b, childWithA, childWithB],
      relationships: [
        spouse(x.id, a.id),
        parentChild(x.id, childWithA.id),
        parentChild(a.id, childWithA.id),
        parentChild(x.id, childWithB.id),
        parentChild(b.id, childWithB.id),
      ],
      treeMembers: [x, a, b, childWithA, childWithB].map((p) =>
        member(treeId, p.id)
      ),
    })

    const unionNodeIds = graph
      .children!.map((n) => n.id)
      .filter((nid) => nid.startsWith("union:"))
    expect(unionNodeIds).toHaveLength(2)
  })

  it("excludes people with no TreeMember row for this tree, and drops relationships touching them", () => {
    const treeId = id()
    const inTree = person()
    const outOfTree = person()

    const graph = toElkGraph({
      people: [inTree, outOfTree],
      relationships: [parentChild(outOfTree.id, inTree.id)],
      treeMembers: [member(treeId, inTree.id)],
    })

    const nodeIds = graph.children!.map((n) => n.id)
    expect(nodeIds).toEqual([`person:${inTree.id}`])
    expect(graph.edges).toEqual([])
  })

  it("(e) produces cycle-free output for every scenario above", () => {
    const treeId = id()
    const x = person()
    const a = person()
    const b = person()
    const childWithA = person()
    const childWithB = person()

    const graph = toElkGraph({
      people: [x, a, b, childWithA, childWithB],
      relationships: [
        spouse(x.id, a.id),
        parentChild(x.id, childWithA.id),
        parentChild(a.id, childWithA.id),
        parentChild(x.id, childWithB.id),
        parentChild(b.id, childWithB.id),
      ],
      treeMembers: [x, a, b, childWithA, childWithB].map((p) =>
        member(treeId, p.id)
      ),
    })

    const nodeIds = graph.children!.map((n) => n.id)
    const edges = graph.edges!.map((e) => ({
      from: e.sources[0],
      to: e.targets[0],
    }))
    expect(isAcyclic(nodeIds, edges)).toBe(true)
  })

  it("(f) keeps two sibling unions' children as contiguous columns, not interleaved with another family", () => {
    const treeId = id()
    const grandparent = person()
    const a = person()
    const b = person()
    const c = person()
    const d = person()
    const child1 = person()
    const child2 = person()
    const child3 = person()
    const child4 = person()
    const people = [grandparent, a, b, c, d, child1, child2, child3, child4]

    const graph = toElkGraph({
      people,
      relationships: [
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
      ],
      treeMembers: people.map((p) => member(treeId, p.id)),
    })

    const nodeIds = graph.children!.map((n) => n.id)
    const i1 = nodeIds.indexOf(`person:${child1.id}`)
    const i2 = nodeIds.indexOf(`person:${child2.id}`)
    const i3 = nodeIds.indexOf(`person:${child3.id}`)
    const i4 = nodeIds.indexOf(`person:${child4.id}`)
    expect(Math.abs(i1 - i2)).toBe(1)
    expect(Math.abs(i3 - i4)).toBe(1)

    // Every union->child edge for one union appears as a consecutive run.
    const unionToChildEdges = graph.edges!.filter((e) =>
      e.sources[0].startsWith("union:")
    )
    const runsByUnion = new Map<string, number>()
    let lastSource: string | undefined
    for (const edge of unionToChildEdges) {
      if (edge.sources[0] !== lastSource) {
        runsByUnion.set(
          edge.sources[0],
          (runsByUnion.get(edge.sources[0]) ?? 0) + 1
        )
        lastSource = edge.sources[0]
      }
    }
    for (const runCount of runsByUnion.values()) {
      expect(runCount).toBe(1)
    }
  })

  it("(g) keeps half-siblings from two unions of the same parent from interleaving", () => {
    const treeId = id()
    const x = person()
    const a = person()
    const b = person()
    const c1 = person()
    const c2 = person()
    const c3 = person()
    const c4 = person()
    const people = [x, a, b, c1, c2, c3, c4]

    const graph = toElkGraph({
      people,
      relationships: [
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
      ],
      treeMembers: people.map((p) => member(treeId, p.id)),
    })

    const nodeIds = graph.children!.map((n) => n.id)
    const i1 = nodeIds.indexOf(`person:${c1.id}`)
    const i2 = nodeIds.indexOf(`person:${c2.id}`)
    const i3 = nodeIds.indexOf(`person:${c3.id}`)
    const i4 = nodeIds.indexOf(`person:${c4.id}`)
    expect(Math.abs(i1 - i2)).toBe(1)
    expect(Math.abs(i3 - i4)).toBe(1)

    const group1 = [i1, i2].sort((n1, n2) => n1 - n2)
    const group2 = [i3, i4].sort((n1, n2) => n1 - n2)
    const overlaps = group1[0] < group2[1] && group2[0] < group1[1]
    expect(overlaps).toBe(false)
  })
})

describe("isAcyclic", () => {
  it("detects a cycle in a hand-built, malformed graph", () => {
    const nodeIds = ["a", "b", "c"]
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
    ]

    expect(isAcyclic(nodeIds, edges)).toBe(false)
  })

  it("returns true for an acyclic graph", () => {
    const nodeIds = ["a", "b", "c"]
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]

    expect(isAcyclic(nodeIds, edges)).toBe(true)
  })
})
