import { afterEach, describe, expect, it } from "vitest"

import {
  clearBackupNudgeDismissal,
  getBackupNudgeDismissedAt,
  getLastChangeDate,
  getLastExportDate,
  setBackupNudgeDismissedAt,
  setLastChangeDate,
  setLastExportDate,
} from "~/lib/db/app-meta"
import { db } from "~/lib/db/db"

afterEach(async () => {
  await db.appMeta.clear()
})

describe("app-meta", () => {
  it("returns undefined when no export has been recorded", async () => {
    expect(await getLastExportDate()).toBeUndefined()
  })

  it("round-trips a recorded export date", async () => {
    await setLastExportDate("2026-08-29T00:00:00.000Z")
    expect(await getLastExportDate()).toBe("2026-08-29T00:00:00.000Z")
  })

  it("overwrites the previous export date", async () => {
    await setLastExportDate("2026-08-29T00:00:00.000Z")
    await setLastExportDate("2026-08-30T00:00:00.000Z")
    expect(await getLastExportDate()).toBe("2026-08-30T00:00:00.000Z")
  })

  it("defaults to the current time when no date is given", async () => {
    await setLastExportDate()
    const stored = await getLastExportDate()
    expect(stored).toBeDefined()
    expect(new Date(stored!).toString()).not.toBe("Invalid Date")
  })
})

describe("app-meta change stamp", () => {
  it("round-trips a recorded change date", async () => {
    await setLastChangeDate("2026-08-29T00:00:00.000Z")
    expect(await getLastChangeDate()).toBe("2026-08-29T00:00:00.000Z")
  })

  it("keeps the export and change dates in separate keys", async () => {
    await setLastExportDate("2026-08-01T00:00:00.000Z")
    await setLastChangeDate("2026-08-29T00:00:00.000Z")

    expect(await getLastExportDate()).toBe("2026-08-01T00:00:00.000Z")
    expect(await getLastChangeDate()).toBe("2026-08-29T00:00:00.000Z")
  })

  it("defaults to the current time when no date is given", async () => {
    await setLastChangeDate()
    expect(new Date((await getLastChangeDate())!).toString()).not.toBe(
      "Invalid Date"
    )
  })
})

describe("app-meta nudge dismissal", () => {
  it("returns undefined before anything is dismissed", async () => {
    expect(await getBackupNudgeDismissedAt()).toBeUndefined()
  })

  it("round-trips a dismissal", async () => {
    await setBackupNudgeDismissedAt("2026-08-29T00:00:00.000Z")
    expect(await getBackupNudgeDismissedAt()).toBe("2026-08-29T00:00:00.000Z")
  })

  it("clears a dismissal without touching the export date", async () => {
    await setLastExportDate("2026-08-01T00:00:00.000Z")
    await setBackupNudgeDismissedAt("2026-08-29T00:00:00.000Z")

    await clearBackupNudgeDismissal()

    expect(await getBackupNudgeDismissedAt()).toBeUndefined()
    expect(await getLastExportDate()).toBe("2026-08-01T00:00:00.000Z")
  })

  it("is safe to clear when nothing was dismissed", async () => {
    await expect(clearBackupNudgeDismissal()).resolves.toBeUndefined()
  })
})
