import { describe, expect, it } from "vitest"

import { filterHiddenGenerations } from "~/lib/canvas/filter-generations"
import type { ReactFlowGraph } from "~/lib/layout/to-react-flow-graph"

function graph(): ReactFlowGraph {
  return {
    nodes: [
      {
        id: "person:a",
        type: "person",
        position: { x: 0, y: 0 },
        data: { generation: 0 },
      },
      {
        id: "person:b",
        type: "person",
        position: { x: 0, y: 0 },
        data: { generation: 0 },
      },
      {
        id: "person:c",
        type: "person",
        position: { x: 0, y: 0 },
        data: { generation: 1 },
      },
      {
        id: "union:a|b",
        type: "union",
        position: { x: 0, y: 0 },
        data: { union: { parents: ["a", "b"] } },
      },
    ],
    edges: [
      { id: "e1", source: "person:a", target: "union:a|b" },
      { id: "e2", source: "union:a|b", target: "person:c" },
    ],
  } as unknown as ReactFlowGraph
}

describe("filterHiddenGenerations", () => {
  it("returns the graph untouched when nothing is hidden", () => {
    const g = graph()
    expect(filterHiddenGenerations(g, [])).toBe(g)
  })

  it("drops people in a hidden generation and edges touching them", () => {
    const result = filterHiddenGenerations(graph(), [1])
    expect(result.nodes.map((n) => n.id)).toEqual([
      "person:a",
      "person:b",
      "union:a|b",
    ])
    expect(result.edges.map((e) => e.id)).toEqual(["e1"])
  })

  it("drops a union when either parent's generation is hidden", () => {
    const result = filterHiddenGenerations(graph(), [0])
    expect(result.nodes.map((n) => n.id)).toEqual(["person:c"])
    expect(result.edges).toEqual([])
  })
})
