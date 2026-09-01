import { describe, expect, it } from "vitest"

import { oldestRecordAt } from "~/lib/backup/use-backup-nudge"
import type { Person } from "~/lib/types"

function person(id: string, createdAt: number): Person {
  return { id, givenName: id, createdAt, updatedAt: createdAt }
}

describe("oldestRecordAt", () => {
  it("finds the earliest createdAt whatever order the list is in", () => {
    expect(
      oldestRecordAt([person("a", 300), person("b", 100), person("c", 200)])
    ).toBe(100)
  })

  it("returns undefined for an empty pool", () => {
    expect(oldestRecordAt([])).toBeUndefined()
  })

  it("handles a createdAt of 0 without treating it as absent", () => {
    expect(oldestRecordAt([person("a", 0), person("b", 5)])).toBe(0)
  })
})
