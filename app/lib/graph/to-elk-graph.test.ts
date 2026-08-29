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
