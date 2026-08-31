import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { EdgeRouting } from "~/lib/canvas/edge-routing"
import type { LayoutDirection } from "~/lib/canvas/layout-direction"

export const GENERATION_LEVELS = 6

export interface AppearanceSettings {
  personWidth: number
  personHeight: number
  avatarSize: number
  horizontalSpacing: number
  verticalSpacing: number
  edgeStrokeWidth: number
  layoutDirection: LayoutDirection
  edgeRouting: EdgeRouting
  spouseColor: string | null
  parentChildColor: string | null
  generationColors: (string | null)[]
}

// Matches the constants/CSS vars this feature replaces (to-elk-graph.ts's
// PERSON_WIDTH/HEIGHT, run-layout.ts's DEFAULT_LAYOUT_OPTIONS spacing, the
// hardcoded strokeWidth in to-react-flow-graph.ts) so an unmodified install
// renders identically to before this store existed.
export const DEFAULT_APPEARANCE: AppearanceSettings = {
  personWidth: 250,
  personHeight: 200,
  avatarSize: 120,
  horizontalSpacing: 40,
  verticalSpacing: 90,
  edgeStrokeWidth: 2,
  layoutDirection: "DOWN",
  edgeRouting: "smoothstep",
  spouseColor: null,
  parentChildColor: null,
  generationColors: Array.from({ length: GENERATION_LEVELS }, () => null),
}

interface AppearanceState {
  settings: AppearanceSettings
  setSetting: <K extends keyof AppearanceSettings>(
    key: K,
    value: AppearanceSettings[K]
  ) => void
  setGenerationColor: (index: number, color: string | null) => void
  resetToDefaults: () => void
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      settings: DEFAULT_APPEARANCE,
      setSetting: (key, value) =>
        set((state) => ({ settings: { ...state.settings, [key]: value } })),
      setGenerationColor: (index, color) =>
        set((state) => {
          const generationColors = [...state.settings.generationColors]
          generationColors[index] = color
          return { settings: { ...state.settings, generationColors } }
        }),
      resetToDefaults: () => set({ settings: DEFAULT_APPEARANCE }),
    }),
    { name: "familytree:appearance" }
  )
)
