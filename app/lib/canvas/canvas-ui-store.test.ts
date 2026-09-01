import { afterEach, describe, expect, it } from "vitest"

import {
  selectedNodeIdOf,
  useCanvasUIStore,
} from "~/lib/canvas/canvas-ui-store"

afterEach(() => {
  useCanvasUIStore.setState({ selectedNodeIds: [], pendingMarriage: null })
})

describe("useCanvasUIStore", () => {
  it("select replaces the selection, select(null) clears it", () => {
    useCanvasUIStore.getState().select("person:1")
    expect(useCanvasUIStore.getState().selectedNodeIds).toEqual(["person:1"])

    useCanvasUIStore.getState().select("person:2")
    expect(useCanvasUIStore.getState().selectedNodeIds).toEqual(["person:2"])

    useCanvasUIStore.getState().select(null)
    expect(useCanvasUIStore.getState().selectedNodeIds).toEqual([])
  })

  it("toggleSelected adds a card and takes it back out again", () => {
    useCanvasUIStore.getState().select("person:1")
    useCanvasUIStore.getState().toggleSelected("person:2")
    expect(useCanvasUIStore.getState().selectedNodeIds).toEqual([
      "person:1",
      "person:2",
    ])

    useCanvasUIStore.getState().toggleSelected("person:1")
    expect(useCanvasUIStore.getState().selectedNodeIds).toEqual(["person:2"])
  })

  // A one-shot request is always about one specific card, so it replaces
  // whatever multi-selection was standing rather than joining it.
  it("requestCenter narrows a multi-selection to the one node asked for", () => {
    useCanvasUIStore.getState().select("person:1")
    useCanvasUIStore.getState().toggleSelected("person:2")
    useCanvasUIStore.getState().requestCenter("person:3")
    expect(useCanvasUIStore.getState().selectedNodeIds).toEqual(["person:3"])
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

describe("selectedNodeIdOf", () => {
  it("answers only when exactly one node is selected", () => {
    expect(selectedNodeIdOf(["person:1"])).toBe("person:1")
  })

  // Picking a member of a multi-selection would have the detail panel claim
  // something the selection does not say.
  it("answers null for an empty or multiple selection", () => {
    expect(selectedNodeIdOf([])).toBeNull()
    expect(selectedNodeIdOf(["person:1", "person:2"])).toBeNull()
  })
})
