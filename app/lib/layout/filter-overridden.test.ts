import { describe, expect, it } from "vitest"

import { filterOverridden } from "~/lib/layout/filter-overridden"

describe("filterOverridden", () => {
  it("removes overridden node ids from the positions map", () => {
    const positions = {
      "person:a": { x: 0, y: 0 },
      "person:b": { x: 10, y: 10 },
      "union:a:b": { x: 5, y: 5 },
    }

    expect(filterOverridden(positions, ["person:a"])).toEqual({
      "person:b": { x: 10, y: 10 },
      "union:a:b": { x: 5, y: 5 },
    })
  })

  it("returns the map unchanged when nothing is overridden", () => {
    const positions = { "person:a": { x: 0, y: 0 } }
    expect(filterOverridden(positions, [])).toEqual(positions)
  })
})
