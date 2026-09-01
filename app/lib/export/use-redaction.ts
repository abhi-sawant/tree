import { useMemo } from "react"

import { usePeople } from "~/lib/db/hooks"
import { countPresumedLiving } from "~/lib/export/redaction"
import { usePrivacyStore } from "~/lib/ui/privacy-store"

export interface RedactionState {
  redactLiving: boolean
  setRedactLiving: (redactLiving: boolean) => void
  // Whole-pool, matching the scope of the GEDCOM and backup exports. Shown
  // beside the switch so the reach of the setting is visible before it is used
  // rather than discovered in the exported file.
  presumedLivingCount: number
}

export function useRedaction(): RedactionState {
  const redactLiving = usePrivacyStore((s) => s.redactLiving)
  const setRedactLiving = usePrivacyStore((s) => s.setRedactLiving)
  const people = usePeople()

  const presumedLivingCount = useMemo(
    () => countPresumedLiving(people ?? []),
    [people]
  )

  return { redactLiving, setRedactLiving, presumedLivingCount }
}
