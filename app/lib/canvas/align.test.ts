import { describe, expect, it } from "vitest"

import { alignModeLabel, alignTargets } from "~/lib/canvas/align"

const row = [
  { personId: "a", x: 10, y: 100 },
  { personId: "b", x: 200, y: 60 },
  { personId: "c", x: 400, y: 140 },
]

describe("alignTargets", () => {
  it("snaps tops to the topmost card and leaves x alone", () => {
    expect(alignTargets(row, "tops")).toEqual([
      { personId: "a", x: 10, y: 60 },
      { personId: "c", x: 400, y: 60 },
    ])
  })

  it("snaps left edges to the leftmost card and leaves y alone", () => {
    expect(alignTargets(row, "left-edges")).toEqual([
      { personId: "b", x: 10, y: 60 },
      { personId: "c", x: 10, y: 140 },
    ])
  })

  // Snapping to an extreme rather than an average is what makes the result
  // predictable: the card that defines the line does not move.
  it("leaves the card that defines the line exactly where it was", () => {
    const moved = alignTargets(row, "tops")
    expect(moved.some((t) => t.personId === "b")).toBe(false)
  })

  it("writes nothing when the cards are already aligned", () => {
    const aligned = [
      { personId: "a", x: 10, y: 50 },
      { personId: "b", x: 200, y: 50 },
    ]
    expect(alignTargets(aligned, "tops")).toEqual([])
  })

  // A single card has no line to align to, and aligning it to itself would
  // still write a position override it never had before.
  it("does nothing for fewer than two cards", () => {
    expect(alignTargets([row[0]], "tops")).toEqual([])
    expect(alignTargets([], "left-edges")).toEqual([])
  })

  it("handles negative coordinates", () => {
    const spread = [
      { personId: "a", x: -300, y: 10 },
      { personId: "b", x: 100, y: -80 },
    ]
    expect(alignTargets(spread, "tops")).toEqual([
      { personId: "a", x: -300, y: -80 },
    ])
    expect(alignTargets(spread, "left-edges")).toEqual([
      { personId: "b", x: -300, y: -80 },
    ])
  })
})

describe("alignModeLabel", () => {
  it("names both modes", () => {
    expect(alignModeLabel("tops")).toBe("Align tops")
    expect(alignModeLabel("left-edges")).toBe("Align left edges")
  })
})
