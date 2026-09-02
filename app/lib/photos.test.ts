import { afterEach, describe, expect, it, vi } from "vitest"

import { db } from "~/lib/db/db"
import { createPerson } from "~/lib/db/people"
import { personPhotoIds } from "~/lib/person-photos"
import {
  addPersonPhoto,
  computeTargetDimensions,
  recompressAllPhotos,
  recompressPhoto,
  removePersonPhoto,
  removePersonPhotoById,
  resizeAndCompressImage,
  setPersonCoverPhoto,
  setPersonPhoto,
  setPersonPhotoOrder,
  shouldKeepRecompressed,
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

describe("addPersonPhoto", () => {
  it("appends without disturbing the cover", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const first = await addPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")
    const second = await addPersonPhoto(
      person.id,
      new Blob(["b"]),
      "image/jpeg"
    )

    const stored = await db.people.get(person.id)
    expect(personPhotoIds(stored)).toEqual([first, second])
    expect(stored?.photoId).toBe(first)
  })

  it("refuses to add a photo to a person who doesn't exist", async () => {
    await expect(
      addPersonPhoto("nobody", new Blob(["a"]), "image/jpeg")
    ).rejects.toThrow(/not found/i)
    expect(await db.photos.count()).toBe(0)
  })
})

describe("setPersonPhoto with a gallery", () => {
  // The form shows one avatar, so "Change photo" can only mean the cover.
  // Dropping the other three silently would be a data loss nothing warned of.
  it("replaces only the cover and leaves the rest in place", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const first = await addPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")
    const second = await addPersonPhoto(
      person.id,
      new Blob(["b"]),
      "image/jpeg"
    )

    const replacement = await setPersonPhoto(
      person.id,
      new Blob(["c"]),
      "image/jpeg"
    )

    expect(personPhotoIds(await db.people.get(person.id))).toEqual([
      replacement,
      second,
    ])
    expect(await db.photos.get(first)).toBeUndefined()
    expect(await db.photos.get(second)).toBeDefined()
  })
})

describe("removePersonPhotoById", () => {
  it("removes one photo and promotes nothing when it wasn't the cover", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const first = await addPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")
    const second = await addPersonPhoto(
      person.id,
      new Blob(["b"]),
      "image/jpeg"
    )

    await removePersonPhotoById(person.id, second)

    const stored = await db.people.get(person.id)
    expect(personPhotoIds(stored)).toEqual([first])
    expect(stored?.photoId).toBe(first)
    expect(await db.photos.get(second)).toBeUndefined()
  })

  it("promotes the next photo when the cover is removed", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const first = await addPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")
    const second = await addPersonPhoto(
      person.id,
      new Blob(["b"]),
      "image/jpeg"
    )

    await removePersonPhoto(person.id)

    const stored = await db.people.get(person.id)
    expect(personPhotoIds(stored)).toEqual([second])
    expect(stored?.photoId).toBe(second)
    expect(await db.photos.get(first)).toBeUndefined()
  })

  it("leaves a photo belonging to someone else alone", async () => {
    const [ada, grace] = await Promise.all([
      createPerson({ givenName: "Ada" }),
      createPerson({ givenName: "Grace" }),
    ])
    const hers = await addPersonPhoto(grace.id, new Blob(["a"]), "image/jpeg")

    await removePersonPhotoById(ada.id, hers)

    expect(await db.photos.get(hers)).toBeDefined()
    expect(personPhotoIds(await db.people.get(grace.id))).toEqual([hers])
  })

  it("clears both fields when the last photo goes", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const only = await addPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")

    await removePersonPhotoById(person.id, only)

    // Both cleared to undefined rather than left as an empty array, so a
    // person with no photos looks exactly as they always have on disk.
    const stored = await db.people.get(person.id)
    expect(stored?.photoIds).toBeUndefined()
    expect(stored?.photoId).toBeUndefined()
    expect(personPhotoIds(stored)).toEqual([])
  })
})

describe("setPersonCoverPhoto", () => {
  it("promotes a photo and mirrors it into the legacy field", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const first = await addPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")
    const second = await addPersonPhoto(
      person.id,
      new Blob(["b"]),
      "image/jpeg"
    )
    const third = await addPersonPhoto(person.id, new Blob(["c"]), "image/jpeg")

    await setPersonCoverPhoto(person.id, third)

    const stored = await db.people.get(person.id)
    expect(personPhotoIds(stored)).toEqual([third, first, second])
    expect(stored?.photoId).toBe(third)
  })
})

describe("setPersonPhotoOrder", () => {
  it("writes a reordering of the same set", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const a = await addPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")
    const b = await addPersonPhoto(person.id, new Blob(["b"]), "image/jpeg")

    await setPersonPhotoOrder(person.id, [b, a])

    expect(personPhotoIds(await db.people.get(person.id))).toEqual([b, a])
  })

  // A stale list is the dangerous case: writing it verbatim would drop photos
  // the person still has, or claim ones that belong to somebody else.
  it("refuses an order that isn't a permutation of what the person has", async () => {
    const person = await createPerson({ givenName: "Ada" })
    const a = await addPersonPhoto(person.id, new Blob(["a"]), "image/jpeg")
    const b = await addPersonPhoto(person.id, new Blob(["b"]), "image/jpeg")

    await setPersonPhotoOrder(person.id, [a])
    await setPersonPhotoOrder(person.id, [a, b, "ghost"])
    await setPersonPhotoOrder(person.id, [a, a])

    expect(personPhotoIds(await db.people.get(person.id))).toEqual([a, b])
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
