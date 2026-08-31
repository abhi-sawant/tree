import { afterEach, describe, expect, it, vi } from "vitest"

import { db } from "~/lib/db/db"
import { createPerson } from "~/lib/db/people"
import {
  computeTargetDimensions,
  removePersonPhoto,
  resizeAndCompressImage,
  setPersonPhoto,
} from "~/lib/photos"

afterEach(async () => {
  await Promise.all([db.people.clear(), db.photos.clear()])
})

describe("computeTargetDimensions", () => {
  it("passes through dimensions already within bounds", () => {
    expect(computeTargetDimensions(400, 300, 800)).toEqual({
      width: 400,
      height: 300,
    })
  })

  it("scales down a width-dominant image", () => {
    expect(computeTargetDimensions(1600, 800, 800)).toEqual({
      width: 800,
      height: 400,
    })
  })

  it("scales down a height-dominant image", () => {
    expect(computeTargetDimensions(800, 1600, 800)).toEqual({
      width: 400,
      height: 800,
    })
  })

  it("never upscales a small image", () => {
    expect(computeTargetDimensions(100, 50, 800)).toEqual({
      width: 100,
      height: 50,
    })
  })

  it("passes through an image exactly at the boundary", () => {
    expect(computeTargetDimensions(800, 800, 800)).toEqual({
      width: 800,
      height: 800,
    })
  })
})

describe("resizeAndCompressImage", () => {
  it("draws the decoded image onto a canvas sized by computeTargetDimensions and encodes as JPEG", async () => {
    const fakeBitmap = { width: 1600, height: 800, close: vi.fn() }
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(fakeBitmap))

    const drawImage = vi.fn()
    const outputBlob = new Blob(["resized"], { type: "image/jpeg" })
    let canvas: HTMLCanvasElement | undefined

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation(
      (tagName: string) => {
        const el = originalCreateElement(tagName)
        if (tagName === "canvas") {
          canvas = el as HTMLCanvasElement
          vi.spyOn(canvas, "getContext").mockReturnValue({
            drawImage,
          } as unknown as CanvasRenderingContext2D)
          vi.spyOn(canvas, "toBlob").mockImplementation((cb) => cb(outputBlob))
        }
        return el
      }
    )

    const result = await resizeAndCompressImage(new Blob(["input"]), {
      maxEdge: 800,
      quality: 0.8,
    })

    expect(canvas?.width).toBe(800)
    expect(canvas?.height).toBe(400)
    expect(drawImage).toHaveBeenCalledWith(fakeBitmap, 0, 0, 800, 400)
    expect(canvas?.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.8
    )
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
    expect(await db.photos.get(photoId)).toMatchObject({
      id: photoId,
      mime: "image/jpeg",
    })
  })

  it("deletes the old Photo row when replacing an existing photo", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const firstId = await setPersonPhoto(
      person.id,
      new Blob(["a"]),
      "image/jpeg"
    )
    const secondId = await setPersonPhoto(
      person.id,
      new Blob(["b"]),
      "image/jpeg"
    )

    expect(await db.photos.get(firstId)).toBeUndefined()
    expect(await db.photos.get(secondId)).toBeDefined()
    expect((await db.people.get(person.id))?.photoId).toBe(secondId)
  })
})

describe("removePersonPhoto", () => {
  it("clears photoId and deletes the Photo row", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const photoId = await setPersonPhoto(
      person.id,
      new Blob(["a"]),
      "image/jpeg"
    )

    await removePersonPhoto(person.id)

    expect((await db.people.get(person.id))?.photoId).toBeUndefined()
    expect(await db.photos.get(photoId)).toBeUndefined()
  })

  it("is a no-op when the person has no photo", async () => {
    const person = await createPerson({ givenName: "Ada" })

    await expect(removePersonPhoto(person.id)).resolves.toBeUndefined()
  })
})
