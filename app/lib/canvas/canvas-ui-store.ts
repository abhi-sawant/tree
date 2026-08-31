import { create } from "zustand"

import type { AddActionKind } from "~/components/canvas/add-relative-menu"

interface PendingMarriage {
  parents: [string, string]
}

interface PendingAddRelative {
  nodeId: string
  kind: AddActionKind
}

interface CanvasUIState {
  selectedNodeId: string | null
  select: (nodeId: string | null) => void

  // One-shot handoff from an implicit union node's "Record marriage" context
  // menu item to the detail panel, consumed once then cleared. Not folded
  // into selectedNodeId because the same union can be selected repeatedly
  // without re-triggering this.
  pendingMarriage: PendingMarriage | null
  requestRecordMarriage: (parents: [string, string]) => void
  clearPendingMarriage: () => void

  // Same one-shot pattern for the canvas quick-add buttons that float under
  // the selected card: they only choose *which* add-relative form the detail
  // panel should open — the panel still owns the form itself.
  pendingAddRelative: PendingAddRelative | null
  requestAddRelative: (nodeId: string, kind: AddActionKind) => void
  clearPendingAddRelative: () => void

  // A node the canvas should scroll to once it exists on screen. Set from
  // the command palette and the table's "open in tree", both of which can
  // fire while the canvas is unmounted — the canvas consumes it on the first
  // render where the node is actually present.
  pendingCenterNodeId: string | null
  requestCenter: (nodeId: string) => void
  clearPendingCenter: () => void

  // Generations the canvas is currently hiding, by zero-based generation
  // index (the same index person-node uses to pick its --level-N colour).
  hiddenGenerations: number[]
  toggleGeneration: (generation: number) => void
  resetHiddenGenerations: () => void
}

export const useCanvasUIStore = create<CanvasUIState>((set) => ({
  selectedNodeId: null,
  select: (nodeId) => set({ selectedNodeId: nodeId }),

  pendingMarriage: null,
  requestRecordMarriage: (parents) => set({ pendingMarriage: { parents } }),
  clearPendingMarriage: () => set({ pendingMarriage: null }),

  pendingAddRelative: null,
  requestAddRelative: (nodeId, kind) =>
    set({ selectedNodeId: nodeId, pendingAddRelative: { nodeId, kind } }),
  clearPendingAddRelative: () => set({ pendingAddRelative: null }),

  pendingCenterNodeId: null,
  requestCenter: (nodeId) =>
    set({ selectedNodeId: nodeId, pendingCenterNodeId: nodeId }),
  clearPendingCenter: () => set({ pendingCenterNodeId: null }),

  hiddenGenerations: [],
  toggleGeneration: (generation) =>
    set((state) => ({
      hiddenGenerations: state.hiddenGenerations.includes(generation)
        ? state.hiddenGenerations.filter((g) => g !== generation)
        : [...state.hiddenGenerations, generation],
    })),
  resetHiddenGenerations: () => set({ hiddenGenerations: [] }),
}))
