import { afterEach, describe, expect, it, vi } from "vitest"

import { toBlob, toPng, toSvg } from "html-to-image"

import {
  EXPORT_BACKGROUND_COLOR,
  exportPngBlob,
  exportPngDataUrl,
  exportSvgBlob,
} from "~/lib/export/image"

vi.mock("html-to-image", () => ({
  toBlob: vi.fn(),
  toPng: vi.fn(),
  toSvg: vi.fn(),
}))

afterEach(() => {
  vi.resetAllMocks()
})

const node = document.createElement("div")

describe("exportPngBlob", () => {
  it("passes capture options through to toBlob, defaulting pixelRatio to 2", async () => {
    const blob = new Blob(["png"])
    vi.mocked(toBlob).mockResolvedValue(blob)

    const result = await exportPngBlob(node, { width: 100, height: 200 })

    expect(result).toBe(blob)
    expect(toBlob).toHaveBeenCalledWith(node, {
      width: 100,
      height: 200,
      backgroundColor: EXPORT_BACKGROUND_COLOR,
      pixelRatio: 2,
    })
  })

  it("honors an overridden pixelRatio", async () => {
    vi.mocked(toBlob).mockResolvedValue(new Blob(["png"]))

    await exportPngBlob(node, { width: 100, height: 200, pixelRatio: 4 })

    expect(toBlob).toHaveBeenCalledWith(
      node,
      expect.objectContaining({ pixelRatio: 4 })
    )
  })

  it("throws when toBlob resolves null", async () => {
    vi.mocked(toBlob).mockResolvedValue(null)

    await expect(
      exportPngBlob(node, { width: 100, height: 200 })
    ).rejects.toThrow("PNG export failed")
  })
})

describe("exportPngDataUrl", () => {
  it("returns the data URL from toPng with options passed through", async () => {
    vi.mocked(toPng).mockResolvedValue("data:image/png;base64,abc")

    const result = await exportPngDataUrl(node, { width: 50, height: 60 })

    expect(result).toBe("data:image/png;base64,abc")
    expect(toPng).toHaveBeenCalledWith(node, {
      width: 50,
      height: 60,
      backgroundColor: EXPORT_BACKGROUND_COLOR,
      pixelRatio: 2,
    })
  })
})

describe("exportSvgBlob", () => {
  it("decodes the toSvg data URL into an svg Blob", async () => {
    const svgText = "<svg><rect/></svg>"
    vi.mocked(toSvg).mockResolvedValue(
      `data:image/svg+xml,${encodeURIComponent(svgText)}`
    )

    const result = await exportSvgBlob(node, { width: 10, height: 10 })

    expect(result.type).toBe("image/svg+xml")
    expect(await result.text()).toBe(svgText)
  })
})
