import { useEffect } from "react"

import { writeFolderBackup } from "~/lib/backup/folder-backup"
import { createChangeScheduler } from "~/lib/backup/schedule"
import { onDataChange } from "~/lib/db/change-signal"
import { toast } from "~/lib/ui/toast-store"

// Longer than the snapshot debounce: this one reads every photo into memory and
// deflates the lot, so it should only fire once the user has genuinely stopped
// typing rather than between two fields of the same form.
export const FOLDER_DEBOUNCE_MS = 20_000

// Registered once from the app root, alongside useAutoSnapshots. The two are
// separate subscriptions rather than one because they answer different
// questions — a snapshot is cheap and frequent, a folder write is expensive and
// rare — and collapsing them would force the cheaper one onto the slower cadence.
//
// `enabled` is the multi-tab leadership flag, and it matters more here than it
// does for snapshots: two tabs deflating every photo and writing the same file
// is the most expensive thing this app can be made to do twice.
export function useFolderBackup(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return
    // As with snapshots, only the first failure is reported. An ejected drive
    // fails on every write, and a toast per edit is the nagging §5.2 rules out.
    // The Settings panel keeps showing the recorded error regardless.
    let reported = false

    function report(message: string) {
      if (reported) return
      reported = true
      toast(message)
    }

    const scheduler = createChangeScheduler({
      delayMs: FOLDER_DEBOUNCE_MS,
      run: async () => {
        const outcome = await writeFolderBackup()
        if (!outcome.written && outcome.reason === "error") {
          report("Couldn't write to the backup folder — check Settings")
        }
        // "prompt" is not reported here. It is the ordinary state after a
        // browser restart, it is not an error, and it can only be fixed by a
        // click in Settings — where it is already shown.
        if (outcome.written) reported = false
      },
      onError: () =>
        report("Couldn't write to the backup folder — check Settings"),
    })

    const off = onDataChange(() => scheduler.request())

    // The end of a session is exactly when the minimum interval should stop
    // applying: its job is bounding cost *during* a session. force skips it.
    const flushNow = () => {
      void writeFolderBackup({ force: true }).catch(() => {})
    }
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return
      scheduler.cancel()
      flushNow()
    }

    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("pagehide", flushNow)

    return () => {
      off()
      document.removeEventListener("visibilitychange", onHidden)
      window.removeEventListener("pagehide", flushNow)
      scheduler.cancel()
    }
  }, [enabled])
}
