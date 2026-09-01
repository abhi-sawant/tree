import { useEffect } from "react"

import { createChangeScheduler } from "~/lib/backup/schedule"
import { setLastChangeDate } from "~/lib/db/app-meta"
import { onDataChange } from "~/lib/db/change-signal"

// Long enough that a burst of edits costs one appMeta write, short enough that
// closing the tab straight after an edit still records it. Nothing reads this
// more often than once per render of the nudge, so precision beyond this buys
// nothing.
export const CHANGE_STAMP_DEBOUNCE_MS = 10_000

// Records *that* something changed, so the staleness nudge can tell unsaved work
// apart from a tree nobody has touched since their last export.
//
// It has to be stamped rather than derived: Relationship carries no timestamps
// at all, and deleting the most recently edited person moves
// max(Person.updatedAt) backwards — which would make a destructive change look
// like a freshly backed-up tree, the worst direction for this signal to be wrong
// in.
//
// appMeta is in BOOKKEEPING_TABLES, so this write does not itself count as a
// change and cannot feed itself.
export function useChangeStamp(): void {
  useEffect(() => {
    const scheduler = createChangeScheduler({
      delayMs: CHANGE_STAMP_DEBOUNCE_MS,
      run: () => setLastChangeDate(),
      // A failed stamp is not worth telling the user about: the consequence is
      // one nudge arriving late, which is strictly better than a toast about
      // internal bookkeeping.
      onError: () => {},
    })

    const off = onDataChange(() => scheduler.request())
    const flush = () => void scheduler.flush()
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush()
    }

    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("pagehide", flush)

    return () => {
      off()
      document.removeEventListener("visibilitychange", onHidden)
      window.removeEventListener("pagehide", flush)
      scheduler.cancel()
    }
  }, [])
}
