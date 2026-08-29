import type { ElkExtendedEdge, ElkNode } from "elkjs"
import { describe, expect, it } from "vitest"

import { computeLayout } from "~/lib/layout/compute-layout"

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
})
