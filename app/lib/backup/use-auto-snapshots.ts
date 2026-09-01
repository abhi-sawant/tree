import { useEffect } from "react"

import { createChangeScheduler } from "~/lib/backup/schedule"
import { createAutoSnapshot } from "~/lib/backup/snapshots"
import { onDataChange } from "~/lib/db/change-signal"
import { toast } from "~/lib/ui/toast-store"

// Long enough that a form submit, a drag, or an add-relative flow — each of
// which writes several rows — settles into one snapshot, and short enough that
// closing the tab straight after an edit still leaves it captured.
export const SNAPSHOT_DEBOUNCE_MS = 4000

// Registered once from the app root. The heavy lifting is all in
// createAutoSnapshot (which decides whether the change was worth a snapshot) and
// createChangeScheduler (which decides when) — this only wires them to the
// change signal and to the page's lifecycle.
//
// `enabled` is the multi-tab leadership flag. Two tabs both snapshotting would
// mostly be absorbed by the ten-minute floor, but the pair that slipped through
// would each burn a retention slot on the same moment in time.
export function useAutoSnapshots(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return
    // Only the first failure is reported. A browser that is out of quota will
    // fail every single time, and a toast per edit would be the nagging §5.2
    // explicitly rules out — while staying silent about a broken safety net
    // would be worse than not having one.
    let reported = false

    const scheduler = createChangeScheduler({
      delayMs: SNAPSHOT_DEBOUNCE_MS,
      run: async () => {
        await createAutoSnapshot()
      },
      onError: () => {
        if (reported) return
        reported = true
        toast("Couldn't save a local snapshot — export a backup to be safe")
      },
    })

    const off = onDataChange(() => scheduler.request())

    // Switching tabs or apps is the moment a pending snapshot is most likely to
    // be abandoned, and unlike pagehide the page is still alive to finish the
    // write. pagehide is tried too, best-effort: a browser that kills the page
    // mid-transaction leaves the last few seconds of edits uncaptured, which is
    // the debounce window's cost and the reason it is seconds rather than
    // minutes.
    const onHidden = () => {
      if (document.visibilityState === "hidden") void scheduler.flush()
    }
    const onPageHide = () => void scheduler.flush()

    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("pagehide", onPageHide)

    return () => {
      off()
      document.removeEventListener("visibilitychange", onHidden)
      window.removeEventListener("pagehide", onPageHide)
      scheduler.cancel()
    }
  }, [enabled])
}
