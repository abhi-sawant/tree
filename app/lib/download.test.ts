import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { triggerDownload } from "~/lib/download"

beforeEach(() => {
  vi.useFakeTimers()
  URL.createObjectURL = vi.fn().mockReturnValue("blob:fake-url")
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("triggerDownload", () => {
  it("creates an anchor with the object URL and filename, clicks it, then cleans up", () => {
    const blob = new Blob(["data"], { type: "text/plain" })

    triggerDownload(blob, "family-tree.json")

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    expect(document.body.querySelector("a")).toBeNull()

    // Revoking synchronously can abort the download in Chrome and Safari.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url")
  })
})
