import { describe, expect, it } from "vitest"

import { extensionForMime, gedcomFormForExtension } from "~/lib/export/mime"

describe("extensionForMime", () => {
  it.each([
    ["image/jpeg", "jpg"],
    ["image/jpg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["IMAGE/PNG", "png"],
    ["image/jpeg; charset=binary", "jpg"],
  ])("maps %s to .%s", (mime, extension) => {
    expect(extensionForMime(mime)).toBe(extension)
  })

  // Not "jpg": naming a file after a format it isn't would make the archive
  // lie, and import reads the authoritative mime from the manifest anyway.
  it("falls back to .bin for an unrecognised type", () => {
    expect(extensionForMime("application/octet-stream")).toBe("bin")
    expect(extensionForMime("")).toBe("bin")
  })
})

describe("gedcomFormForExtension", () => {
  it.each([
    ["jpg", "jpg"],
    ["png", "png"],
    ["tif", "tif"],
  ])("passes %s through as FORM %s", (extension, form) => {
    expect(gedcomFormForExtension(extension)).toBe(form)
  })

  // Unlike extensionForMime this falls back to jpg: an unrecognised FORM makes
  // some importers drop the whole OBJE, and the bytes really are JPEG.
  it("falls back to jpg for anything else", () => {
    expect(gedcomFormForExtension("bin")).toBe("jpg")
  })
})
