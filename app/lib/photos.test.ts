import { afterEach, describe, expect, it, vi } from "vitest"

import { db } from "~/lib/db/db"
import { createPerson } from "~/lib/db/people"
import {
  computeTargetDimensions,
  recompressAllPhotos,
  recompressPhoto,
  removePersonPhoto,
  resizeAndCompressImage,
  setPersonPhoto,
  shouldKeepRecompressed,
} from "~/lib/photos"

afterEach(async () => {
  await Promise.all([db.people.clear(), db.photos.clear()])
})

describe("computeTargetDimensions", () => {
  it("passes through dimensions already within bounds", () => {
    expect(computeTargetDimensions(400, 300, 800)).toEqual({ width: 400, height: 300 })
  })

  it("scales down a width-dominant image", () => {
    expect(computeTargetDimensions(1600, 800, 800)).toEqual({ width: 800, height: 400 })
  })

  it("scales down a height-dominant image", () => {
    expect(computeTargetDimensions(800, 1600, 800)).toEqual({ width: 400, height: 800 })
  })

  it("never upscales a small image", () => {
    expect(computeTargetDimensions(100, 50, 800)).toEqual({ width: 100, height: 50 })
  })

  it("passes through an image exactly at the boundary", () => {
    expect(computeTargetDimensions(800, 800, 800)).toEqual({ width: 800, height: 800 })
  })
})

describe("resizeAndCompressImage", () => {
  it("draws the decoded image onto a canvas sized by computeTargetDimensions and encodes as JPEG", async () => {
    const fakeBitmap = { width: 1600, height: 800, close: vi.fn() }
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue(fakeBitmap),
    )

    const drawImage = vi.fn()
    const outputBlob = new Blob(["resized"], { type: "image/jpeg" })
    let canvas: HTMLCanvasElement | undefined

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName)
      if (tagName === "canvas") {
        canvas = el as HTMLCanvasElement
        vi.spyOn(canvas, "getContext").mockReturnValue({
          drawImage,
        } as unknown as CanvasRenderingContext2D)
        vi.spyOn(canvas, "toBlob").mockImplementation((cb) => cb(outputBlob))
      }
      return el
    })

    const result = await resizeAndCompressImage(new Blob(["input"]), { maxEdge: 800, quality: 0.8 })

    expect(canvas?.width).toBe(800)
    expect(canvas?.height).toBe(400)
    expect(drawImage).toHaveBeenCalledWith(fakeBitmap, 0, 0, 800, 400)
    expect(canvas?.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8)
    expect(result).toBe(outputBlob)

    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
})

describe("setPersonPhoto", () => {
  it("creates a Photo row and sets photoId on first upload", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const blob = new Blob(["a"])

    const photoId = await setPersonPhoto(person.id, blob, "image/jpeg")

    expect((await db.people.get(person.id))?.photoId).toBe(photoId)
    expect(await db.photos.get(photoId)).toMatchObject({ id: photoId, mime: "image/jpeg" })
  })

  it("deletes the old Photo row when replacing an existing photo", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const firstId = await setPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")
    const secondId = await setPersonPhoto(person.id, new Blob(["b"]), "image/jpeg")

    expect(await db.photos.get(firstId)).toBeUndefined()
    expect(await db.photos.get(secondId)).toBeDefined()
    expect((await db.people.get(person.id))?.photoId).toBe(secondId)
  })
})

describe("removePersonPhoto", () => {
  it("clears photoId and deletes the Photo row", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const photoId = await setPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")

    await removePersonPhoto(person.id)

    expect((await db.people.get(person.id))?.photoId).toBeUndefined()
    expect(await db.photos.get(photoId)).toBeUndefined()
  })

  it("is a no-op when the person has no photo", async () => {
    const person = await createPerson({ givenName: "Ada" })

    await expect(removePersonPhoto(person.id)).resolves.toBeUndefined()
  })
})

describe("shouldKeepRecompressed", () => {
  it("keeps a re-encode that saves at least the minimum fraction", () => {
    expect(shouldKeepRecompressed(1000, 900)).toBe(true)
    expect(shouldKeepRecompressed(1000, 950)).toBe(true)
  })

  it("rejects a saving too small to be worth the quality loss", () => {
    expect(shouldKeepRecompressed(1000, 960)).toBe(false)
    expect(shouldKeepRecompressed(1000, 1000)).toBe(false)
  })

  it("rejects a re-encode that grew the file", () => {
    expect(shouldKeepRecompressed(1000, 1200)).toBe(false)
  })

  it("honours a custom minimum saving", () => {
    expect(shouldKeepRecompressed(1000, 990, 0.001)).toBe(true)
    expect(shouldKeepRecompressed(1000, 500, 0.9)).toBe(false)
  })

  it("rejects rather than divides by a zero-length blob", () => {
    expect(shouldKeepRecompressed(0, 0)).toBe(false)
    expect(shouldKeepRecompressed(1000, 0)).toBe(false)
  })
})

describe("recompressPhoto", () => {
  async function seedPhoto(bytes: number, mime = "image/jpeg") {
    const person = await createPerson({ givenName: "Ada" })
    const id = await setPersonPhoto(
      person.id,
      new Blob(["x".repeat(bytes)]),
      mime
    )
    return { person, id }
  }

  it("replaces the blob in place, keeping the same photo id", async () => {
    const { person, id } = await seedPhoto(1000)
    const encode = vi
      .fn()
      .mockResolvedValue(new Blob(["y".repeat(200)], { type: "image/jpeg" }))

    const result = await recompressPhoto(id, { encode })

    expect(result).toEqual({
      photoId: id,
      before: 1000,
      after: 200,
      replaced: true,
    })
    expect((await db.photos.get(id))?.blob.size).toBe(200)
    // The person still points at the same row, so nothing had to be rewritten.
    expect((await db.people.get(person.id))?.photoId).toBe(id)
  })

  it("keeps the original when the saving is too small", async () => {
    const { id } = await seedPhoto(1000)
    const encode = vi.fn().mockResolvedValue(new Blob(["y".repeat(990)]))

    const result = await recompressPhoto(id, { encode })

    expect(result).toMatchObject({ replaced: false })
    expect((await db.photos.get(id))?.blob.size).toBe(1000)
  })

  it("keeps the original when the photo can't be decoded", async () => {
    const { id } = await seedPhoto(1000)
    const encode = vi.fn().mockRejectedValue(new Error("unsupported format"))

    const result = await recompressPhoto(id, { encode })

    expect(result).toEqual({
      photoId: id,
      before: 1000,
      after: 1000,
      replaced: false,
    })
    expect((await db.photos.get(id))?.blob.size).toBe(1000)
  })

  it("returns undefined for a photo id that doesn't exist", async () => {
    expect(await recompressPhoto("nope", { encode: vi.fn() })).toBeUndefined()
  })
})

describe("recompressAllPhotos", () => {
  it("totals kept bytes using the original size where nothing was replaced", async () => {
    const person = await createPerson({ givenName: "Ada" })
    await setPersonPhoto(person.id, new Blob(["x".repeat(1000)]), "image/jpeg")
    const other = await createPerson({ givenName: "Grace" })
    await setPersonPhoto(other.id, new Blob(["x".repeat(500)]), "image/jpeg")

    // Halves the first photo; leaves the second alone.
    const encode = vi
      .fn()
      .mockImplementation((blob: Blob) =>
        Promise.resolve(
          blob.size === 1000
            ? new Blob(["y".repeat(400)])
            : new Blob(["y".repeat(500)])
        )
      )

    const summary = await recompressAllPhotos({ encode })

    expect(summary.considered).toBe(2)
    expect(summary.replaced).toBe(1)
    expect(summary.bytesBefore).toBe(1500)
    expect(summary.bytesAfter).toBe(900)
  })

  it("reports progress once per photo", async () => {
    const person = await createPerson({ givenName: "Ada" })
    await setPersonPhoto(person.id, new Blob(["x"]), "image/jpeg")
    const onProgress = vi.fn()

    await recompressAllPhotos({
      encode: vi.fn().mockResolvedValue(new Blob([""])),
      onProgress,
    })

    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it("returns a zeroed summary with no photos stored", async () => {
    expect(await recompressAllPhotos({ encode: vi.fn() })).toEqual({
      considered: 0,
      replaced: 0,
      bytesBefore: 0,
      bytesAfter: 0,
    })
  })
})
