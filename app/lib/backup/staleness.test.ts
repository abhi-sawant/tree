import { describe, expect, it } from "vitest"

import {
  SNOOZE_DAYS,
  STALE_AFTER_DAYS,
  evaluateStaleness,
  type StalenessInput,
} from "~/lib/backup/staleness"

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date("2026-09-01T12:00:00.000Z").getTime()
const daysAgo = (days: number) => NOW - days * DAY

// A tree in use for a year, edited today, never exported — the shape most of
// these tests vary one field of.
function input(overrides: Partial<StalenessInput> = {}): StalenessInput {
  return {
    now: NOW,
    oldestRecordAt: daysAgo(365),
    lastChangeAt: NOW,
    ...overrides,
  }
}

describe("evaluateStaleness", () => {
  it("stays quiet with no data at all", () => {
    expect(evaluateStaleness({ now: NOW, oldestRecordAt: undefined })).toEqual({
      stale: false,
    })
  })

  it("stays quiet when nothing has changed since the last export", () => {
    expect(
      evaluateStaleness(
        input({ lastExportAt: daysAgo(200), lastChangeAt: daysAgo(300) })
      )
    ).toEqual({ stale: false })
  })

  it("stays quiet for an export and a change in the same millisecond", () => {
    expect(
      evaluateStaleness(input({ lastExportAt: NOW, lastChangeAt: NOW }))
    ).toEqual({ stale: false })
  })

  it("stays quiet when the last export is recent, however old the data is", () => {
    expect(evaluateStaleness(input({ lastExportAt: daysAgo(1) }))).toEqual({
      stale: false,
    })
  })

  it("fires once the last export is older than the threshold and work continued", () => {
    const verdict = evaluateStaleness(
      input({ lastExportAt: daysAgo(STALE_AFTER_DAYS) })
    )

    expect(verdict).toEqual({
      stale: true,
      neverExported: false,
      days: STALE_AFTER_DAYS,
    })
  })

  it("holds off one day short of the threshold", () => {
    expect(
      evaluateStaleness(input({ lastExportAt: daysAgo(STALE_AFTER_DAYS - 1) }))
    ).toEqual({ stale: false })
  })

  it("counts a never-exported tree from when its data started existing", () => {
    const verdict = evaluateStaleness(
      input({ oldestRecordAt: daysAgo(45), lastExportAt: undefined })
    )

    expect(verdict).toEqual({ stale: true, neverExported: true, days: 45 })
  })

  it("does not greet a brand-new tree on its first person", () => {
    expect(
      evaluateStaleness(
        input({ oldestRecordAt: daysAgo(1), lastExportAt: undefined })
      )
    ).toEqual({ stale: false })
  })

  it("treats an unrecorded change date as nothing unexported", () => {
    // An export happened; no change has ever been stamped. Claiming unsaved
    // work here would be an accusation the data doesn't support.
    expect(
      evaluateStaleness(
        input({ lastExportAt: daysAgo(90), lastChangeAt: undefined })
      )
    ).toEqual({ stale: false })
  })

  it("still fires for a never-exported tree with no change date", () => {
    expect(
      evaluateStaleness(
        input({ lastExportAt: undefined, lastChangeAt: undefined })
      )
    ).toMatchObject({ stale: true, neverExported: true })
  })

  it("is suppressed by a recent dismissal", () => {
    expect(
      evaluateStaleness(
        input({ lastExportAt: daysAgo(90), dismissedAt: daysAgo(1) })
      )
    ).toEqual({ stale: false })
  })

  it("returns once the dismissal has expired", () => {
    expect(
      evaluateStaleness(
        input({ lastExportAt: daysAgo(90), dismissedAt: daysAgo(SNOOZE_DAYS) })
      )
    ).toMatchObject({ stale: true })
  })

  it("honours custom thresholds", () => {
    expect(
      evaluateStaleness(input({ lastExportAt: daysAgo(5), staleAfterDays: 3 }))
    ).toMatchObject({ stale: true, days: 5 })
    expect(
      evaluateStaleness(
        input({
          lastExportAt: daysAgo(90),
          dismissedAt: daysAgo(5),
          snoozeDays: 30,
        })
      )
    ).toEqual({ stale: false })
  })

  it("stays quiet rather than guessing when the clock has moved backwards", () => {
    // A last export stamped in the future — a corrected system clock, or a
    // profile synced from another machine.
    expect(evaluateStaleness(input({ lastExportAt: NOW + 10 * DAY }))).toEqual({
      stale: false,
    })
    // Likewise a dismissal from the future.
    expect(
      evaluateStaleness(
        input({ lastExportAt: daysAgo(90), dismissedAt: NOW + DAY })
      )
    ).toEqual({ stale: false })
  })

  it("reports whole days elapsed, rounded down", () => {
    const verdict = evaluateStaleness(
      input({ lastExportAt: daysAgo(31) - 60_000 })
    )
    expect(verdict).toMatchObject({ days: 31 })
  })
})
