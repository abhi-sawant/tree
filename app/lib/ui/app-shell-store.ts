import { create } from "zustand"

import { setLastTreeId } from "~/lib/last-tree"

export type ShellView =
  "tree" | "table" | "photos" | "insights" | "health" | "settings" | "help"

interface AppShellState {
  // Which tree the whole shell is scoped to. Null until the first render
  // resolves it (see resolveActiveTreeId) — the store deliberately doesn't
  // read storage itself so it stays trivially testable.
  activeTreeId: string | null
  view: ShellView
  paletteOpen: boolean

  setActiveTree: (treeId: string) => void
  setView: (view: ShellView) => void
  setPaletteOpen: (open: boolean) => void
}

export const useAppShellStore = create<AppShellState>((set) => ({
  activeTreeId: null,
  view: "tree",
  paletteOpen: false,

  setActiveTree: (treeId) => {
    setLastTreeId(treeId)
    set({ activeTreeId: treeId })
  },
  setView: (view) => set({ view }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
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
