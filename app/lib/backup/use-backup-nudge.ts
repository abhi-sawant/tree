import { useCallback, useEffect, useState } from "react"

import {
  evaluateStaleness,
  type StalenessVerdict,
} from "~/lib/backup/staleness"
import {
  getBackupNudgeDismissedAt,
  getLastChangeDate,
  getLastExportDate,
  setBackupNudgeDismissedAt,
} from "~/lib/db/app-meta"
import type { Person } from "~/lib/types"

const FRESH: StalenessVerdict = { stale: false }

function toMs(iso: string | undefined): number | undefined {
  if (!iso) return undefined
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

// The earliest thing in the pool, which is when this browser started holding
// data worth losing. Taken from the people array the shell already has rather
// than a query, because createdAt isn't indexed and this is read on every
// change to the list anyway.
export function oldestRecordAt(people: Person[]): number | undefined {
  let oldest: number | undefined
  for (const person of people) {
    if (oldest === undefined || person.createdAt < oldest) {
      oldest = person.createdAt
    }
  }
  return oldest
}

export interface BackupNudge {
  verdict: StalenessVerdict
  dismiss: () => void
}

// `exportToken` is the same counter the sidebar and Settings already use to
// re-read app-meta after a backup — exporting has to clear the banner
// immediately, or the button would appear to do nothing.
export function useBackupNudge(
  people: Person[],
  exportToken: number
): BackupNudge {
  const [verdict, setVerdict] = useState<StalenessVerdict>(FRESH)
  const oldest = oldestRecordAt(people)

  const reevaluate = useCallback(async () => {
    const [lastExport, lastChange, dismissed] = await Promise.all([
      getLastExportDate(),
      getLastChangeDate(),
      getBackupNudgeDismissedAt(),
    ])

    setVerdict(
      evaluateStaleness({
        now: Date.now(),
        lastExportAt: toMs(lastExport),
        lastChangeAt: toMs(lastChange),
        oldestRecordAt: oldest,
        dismissedAt: toMs(dismissed),
      })
    )
  }, [oldest])

  useEffect(() => {
    void reevaluate()
  }, [reevaluate, exportToken])

  const dismiss = useCallback(() => {
    // Optimistic, then persisted: the banner must go away on the click, not on
    // the round trip.
    setVerdict(FRESH)
    void setBackupNudgeDismissedAt()
  }, [])

  return { verdict, dismiss }
}
