import { describe, expect, it } from "vitest"

import { mergeLayoutPositions } from "~/lib/layout/merge-positions"
import type { TreeMember } from "~/lib/types"

function member(overrides: Partial<TreeMember> = {}): TreeMember {
  return { treeId: "tree-1", personId: "a", ...overrides }
}

describe("mergeLayoutPositions", () => {
  it("overrides win over the ELK-computed position", () => {
    const elkPositions = { "person:a": { x: 0, y: 0 } }
    const merged = mergeLayoutPositions(elkPositions, [
      member({ personId: "a", x: 100, y: 200 }),
    ])

    expect(merged["person:a"]).toEqual({ x: 100, y: 200 })
  })

  it("leaves non-overridden ids untouched", () => {
    const elkPositions = { "person:a": { x: 0, y: 0 }, "person:b": { x: 10, y: 10 } }
    const merged = mergeLayoutPositions(elkPositions, [member({ personId: "a" })])

    expect(merged["person:a"]).toEqual({ x: 0, y: 0 })
    expect(merged["person:b"]).toEqual({ x: 10, y: 10 })
  })

  it("never touches union node ids, which have no matching TreeMember", () => {
    const elkPositions = { "union:a:b": { x: 5, y: 5 } }
    const merged = mergeLayoutPositions(elkPositions, [
      member({ personId: "a", x: 100, y: 200 }),
    ])

    expect(merged["union:a:b"]).toEqual({ x: 5, y: 5 })
  })
})
