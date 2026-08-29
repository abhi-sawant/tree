import { describe, expect, it } from "vitest"

import { deriveUnions } from "~/lib/graph/derive-unions"
import { toElkGraph } from "~/lib/graph/to-elk-graph"
import {
  toReactFlowGraph,
  type PersonNodeData,
  type UnionNodeData,
} from "~/lib/layout/to-react-flow-graph"
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

describe("toReactFlowGraph", () => {
  it("maps a person node to type 'person', sized to match the ELK constants, carrying the Person in data", () => {
    const treeId = id()
    const a = person({ givenName: "Ada" })
    const graph = toElkGraph({
      people: [a],
      relationships: [],
      treeMembers: [member(treeId, a.id)],
    })

    const { nodes } = toReactFlowGraph({
      graph,
      positions: { [`person:${a.id}`]: { x: 1, y: 2 } },
      people: [a],
      unions: [],
      treeId,
      overriddenNodeIds: [],
    })

    expect(nodes).toHaveLength(1)
    const node = nodes[0]
    expect(node.type).toBe("person")
    expect(node.width).toBe(160)
    expect(node.height).toBe(80)
    expect(node.position).toEqual({ x: 1, y: 2 })
    expect(node.draggable).toBe(true)
    const data = node.data as PersonNodeData
    expect(data.person.givenName).toBe("Ada")
    expect(data.treeId).toBe(treeId)
    expect(data.overridden).toBe(false)
  })

  it("flags a person node as overridden when its id is in overriddenNodeIds", () => {
    const treeId = id()
    const a = person({ givenName: "Ada" })
    const graph = toElkGraph({
      people: [a],
      relationships: [],
      treeMembers: [member(treeId, a.id)],
    })

    const { nodes } = toReactFlowGraph({
      graph,
      positions: { [`person:${a.id}`]: { x: 1, y: 2 } },
      people: [a],
      unions: [],
      treeId,
      overriddenNodeIds: [`person:${a.id}`],
    })

    expect((nodes[0].data as PersonNodeData).overridden).toBe(true)
  })

  it("maps a union node to type 'union', sized to match the ELK constants", () => {
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

    const { unions } = deriveUnions([a, b, child], relationships)
    const unionId = graph
      .children!.map((n) => n.id)
      .find((nid) => nid.startsWith("union:"))!
    const { nodes } = toReactFlowGraph({
      graph,
      positions: { [unionId]: { x: 5, y: 5 } },
      people: [a, b, child],
      unions,
      treeId,
      overriddenNodeIds: [],
    })

    const unionNode = nodes.find((n) => n.id === unionId)!
    expect(unionNode.type).toBe("union")
    expect(unionNode.width).toBe(16)
    expect(unionNode.height).toBe(16)
    expect(unionNode.draggable).toBe(false)
    expect((unionNode.data as UnionNodeData).union).toMatchObject({
      kind: "real",
      parents: expect.arrayContaining([a.id, b.id]),
    })
  })

  it("centers a union node between its two parents' current positions, not wherever ELK placed it", () => {
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

    const { unions } = deriveUnions([a, b, child], relationships)
    const unionId = graph
      .children!.map((n) => n.id)
      .find((nid) => nid.startsWith("union:"))!

    // a is at x=0 (center 80), b is at x=300 (center 380) — true midpoint is 230.
    // Both sit on the same row (y=0). The ELK-reported union position
    // (999, 60) should be ignored in favor of that shared row.
    const { nodes } = toReactFlowGraph({
      graph,
      positions: {
        [`person:${a.id}`]: { x: 0, y: 0 },
        [`person:${b.id}`]: { x: 300, y: 0 },
        [unionId]: { x: 999, y: 60 },
      },
      people: [a, b, child],
      unions,
      treeId,
      overriddenNodeIds: [],
    })

    const unionNode = nodes.find((n) => n.id === unionId)!
    expect(unionNode.position.x).toBe(230 - 8) // minus half the union node's width
    expect(unionNode.position.y).toBe(32) // vertically centered in the couple's row
  })

  it("routes a parent->union edge as a straight line into the side the parent sits on", () => {
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

    const { unions } = deriveUnions([a, b, child], relationships)
    const unionId = graph
      .children!.map((n) => n.id)
      .find((nid) => nid.startsWith("union:"))!

    // a sits to the left of the union, b sits to the right.
    const { edges } = toReactFlowGraph({
      graph,
      positions: {
        [`person:${a.id}`]: { x: 0, y: 0 },
        [`person:${b.id}`]: { x: 300, y: 0 },
        [unionId]: { x: 200, y: 0 },
      },
      people: [a, b, child],
      unions,
      treeId,
      overriddenNodeIds: [],
    })

    const edgeFromA = edges.find((e) => e.source === `person:${a.id}`)!
    expect(edgeFromA).toMatchObject({
      sourceHandle: "right",
      targetHandle: "left",
      type: "straight",
    })

    const edgeFromB = edges.find((e) => e.source === `person:${b.id}`)!
    expect(edgeFromB).toMatchObject({
      sourceHandle: "left",
      targetHandle: "right",
      type: "straight",
    })
  })

  it("falls back to the ELK-computed position when a parent's position is missing", () => {
    const treeId = id()
    const a = person()
    const b = person()
    const relationships = [spouse(a.id, b.id)]
    const graph = toElkGraph({
      people: [a, b],
      relationships,
      treeMembers: [member(treeId, a.id), member(treeId, b.id)],
    })

    const { unions } = deriveUnions([a, b], relationships)
    const unionId = graph
      .children!.map((n) => n.id)
      .find((nid) => nid.startsWith("union:"))!

    const { nodes } = toReactFlowGraph({
      graph,
      positions: { [unionId]: { x: 42, y: 7 } },
      people: [a, b],
      unions,
      treeId,
      overriddenNodeIds: [],
    })

    expect(nodes.find((n) => n.id === unionId)!.position).toEqual({ x: 42, y: 7 })
  })

  it("maps edges from the ELK edge's sources[0]/targets[0]", () => {
    const treeId = id()
    const parent = person()
    const child = person()
    const graph = toElkGraph({
      people: [parent, child],
      relationships: [parentChild(parent.id, child.id)],
      treeMembers: [member(treeId, parent.id), member(treeId, child.id)],
    })

    const { edges } = toReactFlowGraph({
      graph,
      positions: {},
      people: [parent, child],
      unions: [],
      treeId,
      overriddenNodeIds: [],
    })

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      source: `person:${parent.id}`,
      target: `person:${child.id}`,
      sourceHandle: "bottom",
      type: "smoothstep",
    })
  })

  it("produces correct node/edge counts for a remarriage fixture", () => {
    const treeId = id()
    const x = person()
    const a = person()
    const b = person()
    const childWithA = person()
    const childWithB = person()
    const people = [x, a, b, childWithA, childWithB]

    const relationships = [
      spouse(x.id, a.id),
      parentChild(x.id, childWithA.id),
      parentChild(a.id, childWithA.id),
      parentChild(x.id, childWithB.id),
      parentChild(b.id, childWithB.id),
    ]
    const graph = toElkGraph({
      people,
      relationships,
      treeMembers: people.map((p) => member(treeId, p.id)),
    })

    const { unions } = deriveUnions(people, relationships)
    const { nodes, edges } = toReactFlowGraph({
      graph,
      positions: {},
      people,
      unions,
      treeId,
      overriddenNodeIds: [],
    })

    expect(nodes.filter((n) => n.type === "person")).toHaveLength(5)
    expect(nodes.filter((n) => n.type === "union")).toHaveLength(2)
    // 2 parent->union edges per union (4) + 1 union->child edge per union (2) + x's direct link to childWithB's union already counted above
    expect(edges).toHaveLength(graph.edges!.length)
  })
})
