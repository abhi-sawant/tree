import { create } from "zustand"

interface PendingMarriage {
  parents: [string, string]
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
}

export const useCanvasUIStore = create<CanvasUIState>((set) => ({
  selectedNodeId: null,
  select: (nodeId) => set({ selectedNodeId: nodeId }),

  pendingMarriage: null,
  requestRecordMarriage: (parents) => set({ pendingMarriage: { parents } }),
  clearPendingMarriage: () => set({ pendingMarriage: null }),
}))
