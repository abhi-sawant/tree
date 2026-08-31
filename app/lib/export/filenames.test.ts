import { describe, expect, it } from "vitest"

import {
  backupFilename,
  exportFilename,
  gedcomFilename,
  gedcomZipFilename,
  slugify,
} from "~/lib/export/filenames"

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Smith Family")).toBe("smith-family")
  })

  it("collapses punctuation and repeated separators into a single hyphen", () => {
    expect(slugify("O'Brien & Sons!!")).toBe("o-brien-sons")
  })

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--Doe Family--")).toBe("doe-family")
  })

  it("falls back to a default name when nothing alphanumeric remains", () => {
    expect(slugify("???")).toBe("family-tree")
  })
})

describe("exportFilename", () => {
  it("combines the slugified name, today's date, and extension", () => {
    const filename = exportFilename("Smith Family", "png")
    const today = new Date().toISOString().slice(0, 10)
    expect(filename).toBe(`smith-family-${today}.png`)
  })

  it("supports svg and pdf extensions", () => {
    expect(exportFilename("Doe", "svg")).toMatch(/^doe-\d{4}-\d{2}-\d{2}\.svg$/)
    expect(exportFilename("Doe", "pdf")).toMatch(/^doe-\d{4}-\d{2}-\d{2}\.pdf$/)
  })
})

describe("gedcomFilename", () => {
  it("defaults to today's date with no tree name", () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(gedcomFilename()).toBe(`family-tree-${today}.ged`)
  })

  it("accepts an injected date for deterministic output", () => {
    expect(gedcomFilename(new Date("2026-01-05"))).toBe(
      "family-tree-2026-01-05.ged"
    )
  })
})

describe("backupFilename", () => {
  it("is a .zip stamped with the export date", () => {
    expect(backupFilename(new Date("2026-08-31T10:00:00Z"))).toBe(
      "family-tree-backup-2026-08-31.zip"
    )
  })
})

describe("gedcomZipFilename", () => {
  it("uses a different stem from backupFilename so the two can't be confused", () => {
    const date = new Date("2026-08-31T10:00:00Z")
    expect(gedcomZipFilename(date)).toBe("family-tree-gedcom-2026-08-31.zip")
    expect(gedcomZipFilename(date)).not.toBe(backupFilename(date))
  })
})
