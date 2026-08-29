import { afterEach, describe, expect, it } from "vitest"

import { getLastTreeId, setLastTreeId } from "~/lib/last-tree"

afterEach(() => {
  localStorage.clear()
})

describe("last-tree", () => {
  it("returns undefined when nothing is stored", () => {
    expect(getLastTreeId()).toBeUndefined()
  })

  it("round-trips a stored tree id", () => {
    setLastTreeId("tree-1")
    expect(getLastTreeId()).toBe("tree-1")
  })

  it("overwrites the previously stored tree id", () => {
    setLastTreeId("tree-1")
    setLastTreeId("tree-2")
    expect(getLastTreeId()).toBe("tree-2")
  })
})
