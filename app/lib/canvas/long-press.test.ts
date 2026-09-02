import { describe, expect, it } from "vitest"

import { LONG_PRESS_SLOP_PX, movedTooFar } from "~/lib/canvas/long-press"

const origin = { x: 100, y: 100 }

describe("movedTooFar", () => {
  it("tolerates a finger resting on glass", () => {
    expect(movedTooFar(origin, origin)).toBe(false)
    expect(movedTooFar(origin, { x: 104, y: 103 })).toBe(false)
  })

  it("cancels once the press turns into a drag", () => {
    expect(movedTooFar(origin, { x: 130, y: 100 })).toBe(true)
    expect(movedTooFar(origin, { x: 100, y: 60 })).toBe(true)
  })

  it("measures distance, not either axis alone", () => {
    // 6px on each axis is under the threshold per axis but 8.49px of travel,
    // which is past it. Getting this wrong makes a diagonal drag open a menu.
    expect(movedTooFar(origin, { x: 106, y: 106 })).toBe(true)
  })

  it("is exclusive at the threshold", () => {
    expect(movedTooFar(origin, { x: 100 + LONG_PRESS_SLOP_PX, y: 100 })).toBe(
      false
    )
    expect(
      movedTooFar(origin, { x: 100 + LONG_PRESS_SLOP_PX + 1, y: 100 })
    ).toBe(true)
  })
})
