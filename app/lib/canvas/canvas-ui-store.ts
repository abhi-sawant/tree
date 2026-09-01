import { create } from "zustand"

import type { AddActionKind } from "~/components/canvas/add-relative-menu"
import type { FocusMode, FocusScope } from "~/lib/canvas/focus-scope"

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

  // Same one-shot pattern again, for the keyboard's Enter: it asks the detail
  // panel to put the cursor in the selected person's first field, which is the
  // whole of what "edit" means when the panel is already showing that person's
  // form. Kept out of selectedNodeId because selecting a card must not steal
  // focus from the canvas — only Enter does.
  pendingEditNodeId: string | null
  requestEdit: (nodeId: string) => void
  clearPendingEdit: () => void

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

  // Narrows the canvas to one person's lineage. Unlike hiddenGenerations this
  // is applied *before* layout (see tree-view), so the remaining people lay out
  // compactly instead of keeping the gaps left by everyone removed.
  // Whether to glow the line of descent from the selected person to the tree
  // root. Off by default: selection already draws a ring, and glowing a whole
  // path on every click would be noise rather than information.
  showBloodline: boolean
  toggleBloodline: () => void

  focus: FocusScope | null
  setFocus: (focus: FocusScope) => void
  setFocusMode: (mode: FocusMode) => void
  setFocusDepth: (generations: number) => void
  clearFocus: () => void
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

  pendingEditNodeId: null,
  requestEdit: (nodeId) => set({ pendingEditNodeId: nodeId }),
  clearPendingEdit: () => set({ pendingEditNodeId: null }),

  pendingCenterNodeId: null,
  requestCenter: (nodeId) =>
    set({ selectedNodeId: nodeId, pendingCenterNodeId: nodeId }),
  clearPendingCenter: () => set({ pendingCenterNodeId: null }),

  showBloodline: false,
  toggleBloodline: () =>
    set((state) => ({ showBloodline: !state.showBloodline })),

  focus: null,
  setFocus: (focus) => set({ focus }),
  // Changing one dimension of an existing focus keeps the other two, so the
  // toolbar's mode and depth menus don't each need the whole scope.
  setFocusMode: (mode) =>
    set((state) => (state.focus ? { focus: { ...state.focus, mode } } : state)),
  setFocusDepth: (generations) =>
    set((state) =>
      state.focus ? { focus: { ...state.focus, generations } } : state
    ),
  clearFocus: () => set({ focus: null }),

  hiddenGenerations: [],
  toggleGeneration: (generation) =>
    set((state) => ({
      hiddenGenerations: state.hiddenGenerations.includes(generation)
        ? state.hiddenGenerations.filter((g) => g !== generation)
        : [...state.hiddenGenerations, generation],
    })),
  resetHiddenGenerations: () => set({ hiddenGenerations: [] }),
}))
