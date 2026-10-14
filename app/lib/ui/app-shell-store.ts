import { create } from "zustand"

import { setLastTreeId } from "~/lib/last-tree"

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
  paletteOpen: boolean
  mobileSheet: MobileSheet | null

  setActiveTree: (treeId: string) => void
  setPaletteOpen: (open: boolean) => void
  setMobileSheet: (sheet: MobileSheet | null) => void
}

export const useAppShellStore = create<AppShellState>((set) => ({
  activeTreeId: null,
  paletteOpen: false,
  mobileSheet: null,

  setActiveTree: (treeId) => {
    setLastTreeId(treeId)
    set({ activeTreeId: treeId })
  },
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
