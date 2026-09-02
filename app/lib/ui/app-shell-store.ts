import { create } from "zustand"

import { setLastTreeId } from "~/lib/last-tree"

// "more" exists only on a phone: the four views the bottom bar can hold are
// Tree, People, Photos and More, and More is the page everything else lives on.
// It is a view rather than an overlay because that is what the design draws —
// the bottom bar stays visible with More lit, so the reader is somewhere rather
// than in front of something.
export type ShellView =
  | "tree"
  | "table"
  | "photos"
  | "insights"
  | "health"
  | "settings"
  | "help"
  | "more"

// The views the mobile bottom bar reaches directly. Everything else is a
// sub-screen pushed from More, and gets a back affordance to it.
export const BOTTOM_NAV_VIEWS: ShellView[] = ["tree", "table", "photos", "more"]

export function isSubScreen(view: ShellView): boolean {
  return !BOTTOM_NAV_VIEWS.includes(view)
}

// Chrome the desktop topbar shows inline and a phone cannot: each opens as a
// sheet. Held in the store rather than in the topbar's own state because the
// canvas opens the view-options sheet too, from its own control stack.
export type MobileSheet =
  "view-options" | "export" | "tree-switcher" | "more-actions"

interface AppShellState {
  // Which tree the whole shell is scoped to. Null until the first render
  // resolves it (see resolveActiveTreeId) — the store deliberately doesn't
  // read storage itself so it stays trivially testable.
  activeTreeId: string | null
  view: ShellView
  // Where a sub-screen's back button returns to. Only ever a bottom-bar view,
  // so backing out of Health can't land on Settings just because that is where
  // the reader came from — two "back"s in a row would otherwise walk a history
  // this store doesn't keep.
  previousView: ShellView
  paletteOpen: boolean
  mobileSheet: MobileSheet | null

  setActiveTree: (treeId: string) => void
  setView: (view: ShellView) => void
  goBack: () => void
  setPaletteOpen: (open: boolean) => void
  setMobileSheet: (sheet: MobileSheet | null) => void
}

export const useAppShellStore = create<AppShellState>((set) => ({
  activeTreeId: null,
  view: "tree",
  previousView: "tree",
  paletteOpen: false,
  mobileSheet: null,

  setActiveTree: (treeId) => {
    setLastTreeId(treeId)
    set({ activeTreeId: treeId })
  },
  setView: (view) =>
    set((state) => ({
      view,
      previousView: isSubScreen(view)
        ? // Entering a sub-screen: remember where to come back to, unless we
          // came from another sub-screen, in which case the last bottom-bar
          // view we knew about is still the right answer.
          isSubScreen(state.view)
          ? state.previousView
          : state.view
        : state.previousView,
      // A sheet belongs to the screen it was opened from.
      mobileSheet: null,
    })),
  goBack: () =>
    set((state) => ({ view: state.previousView, mobileSheet: null })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setMobileSheet: (mobileSheet) => set({ mobileSheet }),
}))

// Picks the tree the shell should open: whatever is already active, else the
// last one this browser had open, else the first tree that exists. Returns
// undefined only when there are no trees at all (the welcome state).
export function resolveActiveTreeId(
  treeIds: string[],
  activeTreeId: string | null,
  lastTreeId: string | undefined
): string | undefined {
  if (activeTreeId && treeIds.includes(activeTreeId)) return activeTreeId
  if (lastTreeId && treeIds.includes(lastTreeId)) return lastTreeId
  return treeIds[0]
}
