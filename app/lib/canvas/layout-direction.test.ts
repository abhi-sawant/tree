import { Position } from "@xyflow/react"
import { describe, expect, it } from "vitest"

import {
  directionGeometry,
  directionLabel,
  isVertical,
  HANDLE,
} from "~/lib/canvas/layout-direction"
import { buildLayoutOptions } from "~/lib/layout/run-layout"

describe("directionGeometry", () => {
  it("flows top to bottom for DOWN", () => {
    expect(directionGeometry("DOWN")).toEqual({
      inPosition: Position.Top,
      childrenPosition: Position.Bottom,
      crossStartPosition: Position.Left,
      crossEndPosition: Position.Right,
    })
  })

  it("flows left to right for RIGHT", () => {
    expect(directionGeometry("RIGHT")).toEqual({
      inPosition: Position.Left,
      childrenPosition: Position.Right,
      crossStartPosition: Position.Top,
      crossEndPosition: Position.Bottom,
    })
  })

  it("keeps the main axis opposite the cross axis in both directions", () => {
    // A generation must never advance along the same axis siblings spread on,
    // or parents and children would overlap.
    for (const direction of ["DOWN", "RIGHT"] as const) {
      const g = directionGeometry(direction)
      const main = [g.inPosition, g.childrenPosition]
      const cross = [g.crossStartPosition, g.crossEndPosition]
      expect(main.some((p) => cross.includes(p))).toBe(false)
    }
  })
})

describe("isVertical", () => {
  it("is true only for DOWN", () => {
    expect(isVertical("DOWN")).toBe(true)
    expect(isVertical("RIGHT")).toBe(false)
  })
})

describe("HANDLE", () => {
  it("names handles by role, so ids survive a direction change", () => {
    // The whole point: switching direction moves where a handle sits without
    // renaming it, so the edge builder keeps referring to the same three.
    expect(new Set(Object.values(HANDLE)).size).toBe(4)
    for (const id of Object.values(HANDLE)) {
      expect(id).not.toMatch(/top|bottom|left|right/)
    }
  })
})

describe("directionLabel", () => {
  it("reads as a direction of flow, not an axis name", () => {
    expect(directionLabel("DOWN")).toBe("Top to bottom")
    expect(directionLabel("RIGHT")).toBe("Left to right")
  })
})

describe("buildLayoutOptions", () => {
  it("passes the direction straight through to ELK", () => {
    expect(
      buildLayoutOptions({
        horizontalSpacing: 40,
        verticalSpacing: 90,
        direction: "RIGHT",
      })["elk.direction"]
    ).toBe("RIGHT")
  })

  it("defaults to DOWN, matching the shipped layout", () => {
    expect(
      buildLayoutOptions({ horizontalSpacing: 40, verticalSpacing: 90 })[
        "elk.direction"
      ]
    ).toBe("DOWN")
  })

  it("keeps each spacing on its own ELK option regardless of direction", () => {
    // The settings keep their names, but "between layers" is always generation
    // to generation and "nodeNode" always sibling to sibling.
    for (const direction of ["DOWN", "RIGHT"] as const) {
      const options = buildLayoutOptions({
        horizontalSpacing: 11,
        verticalSpacing: 22,
        direction,
      })
      expect(options["elk.spacing.nodeNode"]).toBe("11")
      expect(options["elk.layered.spacing.nodeNodeBetweenLayers"]).toBe("22")
    }
  })
})
