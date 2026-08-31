import { describe, expect, it } from "vitest"

import {
  buildStorageBreakdown,
  formatBytes,
  usedPercent,
  type PhotoSize,
} from "~/lib/storage-breakdown"
import type { Person } from "~/lib/types"

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    givenName: id,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function photo(id: string, size: number, mime = "image/jpeg"): PhotoSize {
  return { id, size, mime }
}

describe("buildStorageBreakdown", () => {
  it("totals every photo and sorts the largest first", () => {
    const breakdown = buildStorageBreakdown(
      [photo("p1", 100), photo("p2", 900), photo("p3", 500)],
      [
        person("a", { photoId: "p1" }),
        person("b", { photoId: "p2" }),
        person("c", { photoId: "p3" }),
      ]
    )

    expect(breakdown.photoCount).toBe(3)
    expect(breakdown.photoBytes).toBe(1500)
    expect(breakdown.largest.map((u) => u.photoId)).toEqual(["p2", "p3", "p1"])
  })

  it("names the person each photo belongs to", () => {
    const breakdown = buildStorageBreakdown(
      [photo("p1", 100)],
      [person("a", { givenName: "Ada", familyName: "Byron", photoId: "p1" })]
    )

    expect(breakdown.largest[0]).toMatchObject({
      personId: "a",
      name: "Ada Byron",
    })
  })

  it("counts a photo no person points at as orphaned", () => {
    const breakdown = buildStorageBreakdown(
      [photo("p1", 100), photo("orphan", 400)],
      [person("a", { photoId: "p1" })]
    )

    expect(breakdown.orphanCount).toBe(1)
    expect(breakdown.orphanBytes).toBe(400)
    expect(breakdown.photoBytes).toBe(500)
    const orphan = breakdown.largest.find((u) => u.photoId === "orphan")
    expect(orphan?.personId).toBeUndefined()
    expect(orphan?.name).toBeUndefined()
  })

  it("counts a photo shared by two people once, attributed to the first", () => {
    const breakdown = buildStorageBreakdown(
      [photo("shared", 300)],
      [
        person("a", { givenName: "Ada", photoId: "shared" }),
        person("b", { givenName: "Grace", photoId: "shared" }),
      ]
    )

    expect(breakdown.photoBytes).toBe(300)
    expect(breakdown.orphanCount).toBe(0)
    expect(breakdown.largest).toHaveLength(1)
    expect(breakdown.largest[0].name).toBe("Ada")
  })

  it("caps the largest list at the limit", () => {
    const photos = Array.from({ length: 12 }, (_, i) =>
      photo(`p${i}`, (i + 1) * 10)
    )

    expect(buildStorageBreakdown(photos, []).largest).toHaveLength(10)
    expect(
      buildStorageBreakdown(photos, [], { limit: 3 }).largest
    ).toHaveLength(3)
    // Still totals everything, not just what the list shows.
    expect(buildStorageBreakdown(photos, [], { limit: 3 }).photoBytes).toBe(780)
  })

  it("breaks size ties on photo id so the order is stable", () => {
    const forward = buildStorageBreakdown(
      [photo("b", 100), photo("a", 100)],
      []
    )
    const reversed = buildStorageBreakdown(
      [photo("a", 100), photo("b", 100)],
      []
    )

    expect(forward.largest.map((u) => u.photoId)).toEqual(["a", "b"])
    expect(reversed.largest.map((u) => u.photoId)).toEqual(["a", "b"])
  })

  it("handles an empty pool", () => {
    expect(buildStorageBreakdown([], [])).toEqual({
      photoCount: 0,
      photoBytes: 0,
      orphanCount: 0,
      orphanBytes: 0,
      largest: [],
    })
  })
})

describe("formatBytes", () => {
  it("reports whole bytes below a kilobyte", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(40)).toBe("40 B")
    expect(formatBytes(999)).toBe("999 B")
  })

  it("uses base 1000, matching what a file browser shows", () => {
    expect(formatBytes(1000)).toBe("1 KB")
    expect(formatBytes(1_000_000)).toBe("1.0 MB")
    expect(formatBytes(1_500_000)).toBe("1.5 MB")
    expect(formatBytes(2_400_000_000)).toBe("2.4 GB")
  })

  it("drops the decimal for KB but keeps it from MB up", () => {
    expect(formatBytes(45_600)).toBe("46 KB")
    expect(formatBytes(45_600_000)).toBe("45.6 MB")
  })

  it("stops at the largest unit it knows", () => {
    expect(formatBytes(5_000_000_000_000_000)).toBe("5000.0 TB")
  })

  it("refuses to guess at a nonsense input", () => {
    expect(formatBytes(-1)).toBe("—")
    expect(formatBytes(Number.NaN)).toBe("—")
  })
})

describe("usedPercent", () => {
  it("rounds to a whole percent", () => {
    expect(usedPercent(374, 1000)).toBe(37)
    expect(usedPercent(376, 1000)).toBe(38)
  })

  it("clamps above quota rather than reporting over 100%", () => {
    expect(usedPercent(2000, 1000)).toBe(100)
  })

  it("returns 0 for an unusable quota instead of dividing by it", () => {
    expect(usedPercent(500, 0)).toBe(0)
  })
})
