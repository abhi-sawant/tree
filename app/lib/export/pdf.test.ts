import { describe, expect, it } from "vitest"

import { fitImageToBox } from "~/lib/export/pdf"

describe("fitImageToBox", () => {
  it("scales a wide image to fit a taller box by its width", () => {
    const result = fitImageToBox(1000, 200, 500, 500)
    expect(result).toEqual({ width: 500, height: 100 })
  })

  it("scales a tall image to fit a wider box by its height", () => {
    const result = fitImageToBox(200, 1000, 500, 500)
    expect(result).toEqual({ width: 100, height: 500 })
  })

  it("fills the box exactly when aspect ratios match", () => {
    const result = fitImageToBox(400, 300, 800, 600)
    expect(result).toEqual({ width: 800, height: 600 })
  })

  it("scales a small image up to fit a larger box", () => {
    const result = fitImageToBox(100, 50, 400, 400)
    expect(result).toEqual({ width: 400, height: 200 })
  })
})
