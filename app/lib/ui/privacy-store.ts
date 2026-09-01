import { create } from "zustand"
import { persist } from "zustand/middleware"

// Its own store rather than a field on the appearance store: this is not a
// display preference, it is a decision about what leaves the machine, and
// filing it beside card widths would make it look like one.
//
// Persisted deliberately. The risk is asymmetric — someone who turned it on and
// found it off next session would publish details they meant to withhold,
// whereas someone who left it on and forgot loses nothing. It can't be
// forgotten silently in any case, because the canvas visibly shows the
// redaction it will export.
export const PRIVACY_STORAGE_KEY = "familytree:privacy"

interface PrivacyState {
  redactLiving: boolean
  setRedactLiving: (redactLiving: boolean) => void
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      redactLiving: false,
      setRedactLiving: (redactLiving) => set({ redactLiving }),
    }),
    { name: PRIVACY_STORAGE_KEY }
  )
)
