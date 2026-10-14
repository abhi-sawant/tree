import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { ColorBy } from "~/lib/canvas/color-groups"
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
  showPhoto: boolean
  showDates: boolean
  colorBy: ColorBy
  spouseColor: string | null
  parentChildColor: string | null
  generationColors: (string | null)[]
}

// Card size is the footprint of a photo print (a 168×196 mount), not the old
// 250×200 box; to-elk-graph.ts's PERSON_WIDTH/HEIGHT remain the layout
// fallbacks for callers that pass no size. Surname colouring is the default
// because it is what the family-album look is built around.
export const DEFAULT_APPEARANCE: AppearanceSettings = {
  personWidth: 168,
  personHeight: 196,
  avatarSize: 120,
  horizontalSpacing: 40,
  verticalSpacing: 90,
  edgeStrokeWidth: 2.5,
  layoutDirection: "DOWN",
  edgeRouting: "smoothstep",
  showPhoto: true,
  showDates: true,
  colorBy: "surname",
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
