import { afterEach, describe, expect, it } from "vitest"

import { getLastExportDate, setLastExportDate } from "~/lib/db/app-meta"
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
