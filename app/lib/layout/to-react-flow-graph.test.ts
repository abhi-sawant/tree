import type { Node } from "@xyflow/react"
import { describe, expect, it } from "vitest"

import { deriveUnions } from "~/lib/graph/derive-unions"
import {
  PERSON_HEIGHT,
  PERSON_WIDTH,
  UNION_HEIGHT,
  UNION_WIDTH,
  toElkGraph,
} from "~/lib/graph/to-elk-graph"
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

function parentChild(
  from: string,
  to: string,
  subtype?: Relationship["subtype"]
): Relationship {
  return { id: id(), type: "parent-child", from, to, subtype }
}

function spouse(
  from: string,
  to: string,
  overrides: Partial<Relationship> = {}
): Relationship {
  return { id: id(), type: "spouse", from, to, ...overrides }
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
      relationships: [],
      unions: [],
      treeId,
      overriddenNodeIds: [],
    })

    expect(nodes).toHaveLength(1)
    const node = nodes[0]
    expect(node.type).toBe("person")
    expect(node.width).toBe(PERSON_WIDTH)
    expect(node.height).toBe(PERSON_HEIGHT)
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
      relationships: [],
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
      relationships,
      unions,
      treeId,
      overriddenNodeIds: [],
    })

    const unionNode = nodes.find((n) => n.id === unionId)!
    expect(unionNode.type).toBe("union")
    expect(unionNode.width).toBe(UNION_WIDTH)
    expect(unionNode.height).toBe(UNION_HEIGHT)
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

    // a is at x=0, b is at x=300, so their centres are half a card apart
    // either side of the true midpoint. Both sit on the same row (y=0); the
    // ELK-reported union position (999, 60) should be ignored in favour of
    // that shared row.
    const { nodes } = toReactFlowGraph({
      graph,
      positions: {
        [`person:${a.id}`]: { x: 0, y: 0 },
        [`person:${b.id}`]: { x: 300, y: 0 },
        [unionId]: { x: 999, y: 60 },
      },
      people: [a, b, child],
      relationships,
      unions,
      treeId,
      overriddenNodeIds: [],
    })

    const unionNode = nodes.find((n) => n.id === unionId)!
    const midpointX = (0 + PERSON_WIDTH / 2 + 300 + PERSON_WIDTH / 2) / 2
    expect(unionNode.position.x).toBe(midpointX - UNION_WIDTH / 2)
    // vertically centered in the couple's row
    expect(unionNode.position.y).toBe(PERSON_HEIGHT / 2 - UNION_HEIGHT / 2)
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
      relationships,
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
      relationships,
      unions,
      treeId,
      overriddenNodeIds: [],
    })

    expect(nodes.find((n) => n.id === unionId)!.position).toEqual({
      x: 42,
      y: 7,
    })
  })

  it("maps edges from the ELK edge's sources[0]/targets[0]", () => {
    const treeId = id()
    const parent = person()
    const child = person()
    const relationships = [parentChild(parent.id, child.id)]
    const graph = toElkGraph({
      people: [parent, child],
      relationships,
      treeMembers: [member(treeId, parent.id), member(treeId, child.id)],
    })

    const { edges } = toReactFlowGraph({
      graph,
      positions: {},
      people: [parent, child],
      relationships,
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
      relationships,
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

describe("toReactFlowGraph parent-child edge subtypes", () => {
  // Builds the full ELK -> React Flow pipeline for one child of `parents`, so
  // the edge under test is the real one the canvas would draw.
  function edgeFor(subtypes: Array<Relationship["subtype"]>) {
    const treeId = id()
    const child = person({ givenName: "Kid" })
    const parents = subtypes.map((_, i) => person({ givenName: `P${i}` }))
    const relationships: Relationship[] = parents.map((p, i) =>
      parentChild(p.id, child.id, subtypes[i])
    )
    if (parents.length === 2) {
      relationships.push(spouse(parents[0].id, parents[1].id))
    }
    const people = [...parents, child]
    const { unions } = deriveUnions(people, relationships)
    const graph = toElkGraph({
      people,
      relationships,
      treeMembers: people.map((p) => member(treeId, p.id)),
    })
    const { edges } = toReactFlowGraph({
      graph,
      positions: {},
      people,
      relationships,
      unions,
      treeId,
      overriddenNodeIds: [],
    })
    const edge = edges.find((e) => e.target === `person:${child.id}`)
    expect(edge).toBeDefined()
    return edge!
  }

  it("dashes a couple's line to a child both parents adopted", () => {
    expect(edgeFor(["adopted", "adopted"]).style?.strokeDasharray).toBe("7 5")
  })

  it("leaves a by-birth line solid", () => {
    expect(
      edgeFor([undefined, undefined]).style?.strokeDasharray
    ).toBeUndefined()
  })

  it("leaves a mixed couple's line solid rather than overstating it", () => {
    // The child descends from one of the two, so dashing the single shared
    // line would assert something false.
    expect(edgeFor([undefined, "step"]).style?.strokeDasharray).toBeUndefined()
  })

  it("dashes a single parent's line by that one link", () => {
    expect(edgeFor(["foster"]).style?.strokeDasharray).toBe("7 5")
    expect(edgeFor([undefined]).style?.strokeDasharray).toBeUndefined()
  })

  it("never dashes a marriage line as a subtype", () => {
    const treeId = id()
    const a = person()
    const b = person()
    const kid = person()
    const relationships = [
      spouse(a.id, b.id),
      parentChild(a.id, kid.id, "adopted"),
      parentChild(b.id, kid.id, "adopted"),
    ]
    const people = [a, b, kid]
    const { unions } = deriveUnions(people, relationships)
    const graph = toElkGraph({
      people,
      relationships,
      treeMembers: people.map((p) => member(treeId, p.id)),
    })
    const { edges } = toReactFlowGraph({
      graph,
      positions: {},
      people,
      relationships,
      unions,
      treeId,
      overriddenNodeIds: [],
    })
    const marriageEdges = edges.filter((e) => e.target.startsWith("union:"))
    expect(marriageEdges).toHaveLength(2)
    for (const edge of marriageEdges) {
      expect(edge.style?.strokeDasharray).toBeUndefined()
    }
  })
})

describe("toReactFlowGraph marriage edges", () => {
  function marriageEdges(spouseOverrides: Partial<Relationship>) {
    const treeId = id()
    const a = person({ givenName: "A" })
    const b = person({ givenName: "B" })
    const relationships = [spouse(a.id, b.id, spouseOverrides)]
    const people = [a, b]
    const { unions } = deriveUnions(people, relationships)
    const graph = toElkGraph({
      people,
      relationships,
      treeMembers: people.map((p) => member(treeId, p.id)),
    })
    const { edges } = toReactFlowGraph({
      graph,
      positions: {},
      people,
      relationships,
      unions,
      treeId,
      overriddenNodeIds: [],
    })
    return edges.filter((e) => e.target.startsWith("union:"))
  }

  it("dashes both halves of the line for a marriage with an end date", () => {
    const edges = marriageEdges({ start: { year: 1980 }, end: { year: 1995 } })
    expect(edges).toHaveLength(2)
    for (const edge of edges) {
      expect(edge.style?.strokeDasharray).toBe("3 3")
    }
  })

  it("leaves an ongoing marriage solid", () => {
    for (const edge of marriageEdges({ start: { year: 1980 } })) {
      expect(edge.style?.strokeDasharray).toBeUndefined()
    }
  })

  it("uses a different dash from a non-biological parent-child link", () => {
    // The two must stay visually distinguishable — an ended marriage and an
    // adoption mean entirely different things.
    const ended = marriageEdges({ end: { year: 1995 } })[0]
    expect(ended.style?.strokeDasharray).not.toBe("7 5")
  })
})

describe("toReactFlowGraph bloodline highlighting", () => {
  // mum + dad -> kid, so the kid's link is drawn through a union dot. The
  // fixture is built first and rendered second, because the node ids fed in as
  // the bloodline are the ones generated here.
  function fixture() {
    const treeId = id()
    const mum = person({ givenName: "Mum" })
    const dad = person({ givenName: "Dad" })
    const kid = person({ givenName: "Kid" })
    const people = [mum, dad, kid]
    const relationships = [
      spouse(mum.id, dad.id),
      parentChild(mum.id, kid.id),
      parentChild(dad.id, kid.id),
    ]
    const { unions } = deriveUnions(people, relationships)
    const graph = toElkGraph({
      people,
      relationships,
      treeMembers: people.map((p) => member(treeId, p.id)),
    })
    return { treeId, people, relationships, unions, graph, mum, dad, kid }
  }

  function render(f: ReturnType<typeof fixture>, bloodlineNodeIds?: string[]) {
    return toReactFlowGraph({
      graph: f.graph,
      positions: {},
      people: f.people,
      relationships: f.relationships,
      unions: f.unions,
      treeId: f.treeId,
      overriddenNodeIds: [],
      bloodlineNodeIds,
    })
  }

  // The line runs mum -> union -> kid, deliberately leaving dad off it.
  function lineOf(f: ReturnType<typeof fixture>): string[] {
    return [`person:${f.mum.id}`, f.unions[0].id, `person:${f.kid.id}`]
  }

  function flagOf(nodes: Node[], nodeId: string): boolean {
    const node = nodes.find((n) => n.id === nodeId)
    expect(node).toBeDefined()
    return (node!.data as PersonNodeData | UnionNodeData).onBloodline
  }

  it("highlights nothing when no bloodline is given", () => {
    const f = fixture()
    const { nodes, edges } = render(f)
    for (const node of nodes) expect(flagOf(nodes, node.id)).toBe(false)
    for (const edge of edges) expect(edge.zIndex).toBe(0)
  })

  it("marks every node on the line, including the union", () => {
    const f = fixture()
    const { nodes } = render(f, lineOf(f))
    expect(flagOf(nodes, `person:${f.mum.id}`)).toBe(true)
    expect(flagOf(nodes, f.unions[0].id)).toBe(true)
    expect(flagOf(nodes, `person:${f.kid.id}`)).toBe(true)
  })

  it("leaves the off-line parent unmarked", () => {
    const f = fixture()
    const { nodes } = render(f, lineOf(f))
    expect(flagOf(nodes, `person:${f.dad.id}`)).toBe(false)
  })

  it("highlights only the on-line half of the marriage line", () => {
    // Both halves run person -> union, but only the parent actually on the
    // line is in the set, so the other half must stay plain.
    const f = fixture()
    const { edges } = render(f, lineOf(f))
    const unionId = f.unions[0].id
    const mumEdge = edges.find(
      (e) => e.source === `person:${f.mum.id}` && e.target === unionId
    )
    const dadEdge = edges.find(
      (e) => e.source === `person:${f.dad.id}` && e.target === unionId
    )
    expect(mumEdge?.zIndex).toBe(1)
    expect(dadEdge?.zIndex).toBe(0)
  })

  it("thickens and recolours the highlighted run", () => {
    const f = fixture()
    const { edges } = render(f, lineOf(f))
    const childEdge = edges.find((e) => e.target === `person:${f.kid.id}`)
    expect(childEdge?.style?.stroke).toBe("var(--primary)")
    expect(childEdge?.style?.strokeWidth).toBe(5)
  })
})
