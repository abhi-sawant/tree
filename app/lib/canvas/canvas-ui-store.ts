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
  // An array rather than one id, because a bulk action needs several cards and
  // a second "multi-selection" alongside the single one would be two sources of
  // truth for the same question. Everything that wants *the* selected node asks
  // selectedNodeIdOf/useSelectedNodeId, which answers only when there is
  // exactly one — a detail panel showing one of five selected people would be
  // claiming something the selection doesn't say.
  selectedNodeIds: string[]
  select: (nodeId: string | null) => void
  // Shift/⌘-click. Toggling rather than adding, so the same gesture takes a
  // card back out of the selection.
  toggleSelected: (nodeId: string) => void

  // One-shot handoff from an implicit union node's "Record marriage" context
  // menu item to the detail panel, consumed once then cleared. Not folded
  // into the selection because the same union can be selected repeatedly
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
  // form. Kept out of the selection because selecting a card must not steal
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
  // Touch has no shift-click, so the only way to build a multi-selection on a
  // phone is to say so first. While this is on, tapping a card toggles it in
  // and out of the selection instead of replacing it. Off on every tier by
  // default: a mouse already has a modifier for this, and a mode that is
  // silently on is a mode that surprises someone.
  selectMode: boolean
  setSelectMode: (selectMode: boolean) => void

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

  // Whether the nested-list rendering of the tree is showing beside the canvas.
  // Off by default — it is a second view of the same thing, not a permanent
  // half of the screen — but it is a real panel rather than a hidden one: an
  // invisible list of focusable buttons is a trap for a sighted keyboard user,
  // and a list worth offering to a screen reader is a list worth being able to
  // look at.
  showOutline: boolean
  toggleOutline: () => void

  focus: FocusScope | null
  setFocus: (focus: FocusScope) => void
  setFocusMode: (mode: FocusMode) => void
  setFocusDepth: (generations: number) => void
  clearFocus: () => void
}

export const useCanvasUIStore = create<CanvasUIState>((set) => ({
  selectedNodeIds: [],
  select: (nodeId) => set({ selectedNodeIds: nodeId ? [nodeId] : [] }),
  toggleSelected: (nodeId) =>
    set((state) => ({
      selectedNodeIds: state.selectedNodeIds.includes(nodeId)
        ? state.selectedNodeIds.filter((id) => id !== nodeId)
        : [...state.selectedNodeIds, nodeId],
    })),

  pendingMarriage: null,
  requestRecordMarriage: (parents) => set({ pendingMarriage: { parents } }),
  clearPendingMarriage: () => set({ pendingMarriage: null }),

  pendingAddRelative: null,
  requestAddRelative: (nodeId, kind) =>
    set({ selectedNodeIds: [nodeId], pendingAddRelative: { nodeId, kind } }),
  clearPendingAddRelative: () => set({ pendingAddRelative: null }),

  pendingEditNodeId: null,
  requestEdit: (nodeId) => set({ pendingEditNodeId: nodeId }),
  clearPendingEdit: () => set({ pendingEditNodeId: null }),

  pendingCenterNodeId: null,
  requestCenter: (nodeId) =>
    set({ selectedNodeIds: [nodeId], pendingCenterNodeId: nodeId }),
  clearPendingCenter: () => set({ pendingCenterNodeId: null }),

  showBloodline: false,
  toggleBloodline: () =>
    set((state) => ({ showBloodline: !state.showBloodline })),

  showOutline: false,
  toggleOutline: () => set((state) => ({ showOutline: !state.showOutline })),

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

  selectMode: false,
  setSelectMode: (selectMode) =>
    set((state) => ({
      selectMode,
      // Leaving the mode with several cards held would strand the reader in
      // the multi-select panel with no gesture to get out of it.
      selectedNodeIds:
        !selectMode && state.selectedNodeIds.length > 1
          ? []
          : state.selectedNodeIds,
    })),

  hiddenGenerations: [],
  toggleGeneration: (generation) =>
    set((state) => ({
      hiddenGenerations: state.hiddenGenerations.includes(generation)
        ? state.hiddenGenerations.filter((g) => g !== generation)
        : [...state.hiddenGenerations, generation],
    })),
  resetHiddenGenerations: () => set({ hiddenGenerations: [] }),
}))

// The one selected node, or null when the selection is empty or holds several.
// Anything that renders or acts on "the" selection — the detail panel, the
// keyboard shortcuts, the bloodline highlight — has to answer null for a
// multi-selection rather than silently picking a member of it.
export function selectedNodeIdOf(selectedNodeIds: string[]): string | null {
  return selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
}

export function useSelectedNodeId(): string | null {
  return useCanvasUIStore((s) => selectedNodeIdOf(s.selectedNodeIds))
}
