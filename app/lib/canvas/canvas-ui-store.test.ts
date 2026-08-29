import { afterEach, describe, expect, it } from "vitest"

import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"

afterEach(() => {
  useCanvasUIStore.setState({ selectedNodeId: null, pendingMarriage: null })
})

describe("useCanvasUIStore", () => {
  it("select sets selectedNodeId, select(null) clears it", () => {
    useCanvasUIStore.getState().select("person:1")
    expect(useCanvasUIStore.getState().selectedNodeId).toBe("person:1")

    useCanvasUIStore.getState().select(null)
    expect(useCanvasUIStore.getState().selectedNodeId).toBeNull()
  })

  it("requestRecordMarriage sets pendingMarriage, clearPendingMarriage clears it", () => {
    useCanvasUIStore.getState().requestRecordMarriage(["a", "b"])
    expect(useCanvasUIStore.getState().pendingMarriage).toEqual({
      parents: ["a", "b"],
    })

    useCanvasUIStore.getState().clearPendingMarriage()
    expect(useCanvasUIStore.getState().pendingMarriage).toBeNull()
  })
})
