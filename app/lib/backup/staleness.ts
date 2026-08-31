// The nudge SPEC.md §5.2 stops short of: "No nagging. Just make the risk
// legible." A banner that appears once a month, only when there is genuinely
// something unsaved, and that can be sent away, stays on the legible side of
// that line. Everything here exists to keep it there.
export const STALE_AFTER_DAYS = 30

// How long a dismissal holds. Long enough that sending it away means something,
// short enough that a month of further editing isn't silently at risk.
export const SNOOZE_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export interface StalenessInput {
  now: number
  lastExportAt?: number
  lastChangeAt?: number
  // When the data started existing — the earliest Person.createdAt. Used as the
  // countdown's origin for someone who has never exported at all.
  oldestRecordAt?: number
  dismissedAt?: number
  staleAfterDays?: number
  snoozeDays?: number
}

export type StalenessVerdict =
  { stale: false } | { stale: true; neverExported: boolean; days: number }

const FRESH: StalenessVerdict = { stale: false }

export function evaluateStaleness(input: StalenessInput): StalenessVerdict {
  const {
    now,
    lastExportAt,
    lastChangeAt,
    oldestRecordAt,
    dismissedAt,
    staleAfterDays = STALE_AFTER_DAYS,
    snoozeDays = SNOOZE_DAYS,
  } = input

  // An empty app has nothing to lose. Nudging someone who hasn't entered
  // anything yet is pure nagging.
  if (oldestRecordAt === undefined) return FRESH

  // Everything is already in a backup. This is the check that makes the banner
  // about risk rather than about the calendar: someone who exported this
  // morning and hasn't touched anything since is never told to export again.
  if (lastExportAt !== undefined && (lastChangeAt ?? 0) <= lastExportAt) {
    return FRESH
  }

  // Someone who has never exported is counted from when their data started
  // existing, not from the epoch — otherwise the banner would greet them on the
  // first person they add, which is exactly the nag §5.2 rules out.
  const since = lastExportAt ?? oldestRecordAt
  const elapsed = now - since
  if (elapsed < staleAfterDays * DAY_MS) return FRESH

  // A clock that has moved backwards makes every interval here negative, which
  // reads as "not yet" throughout. Staying quiet is the right way to be wrong
  // about a nudge.
  if (dismissedAt !== undefined && now - dismissedAt < snoozeDays * DAY_MS) {
    return FRESH
  }

  return {
    stale: true,
    neverExported: lastExportAt === undefined,
    days: Math.floor(elapsed / DAY_MS),
  }
}
