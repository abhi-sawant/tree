import { describe, expect, it } from "vitest"

import { exportFilename, slugify } from "~/lib/export/filenames"

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
