import { db } from "~/lib/db/db"
import { updatePerson } from "~/lib/db/people"
import {
  personPhotoIds,
  photoFieldsFor,
  withCoverPhotoId,
  withoutPhotoId,
} from "~/lib/person-photos"
import type { Photo } from "~/lib/types"

export interface Dimensions {
  width: number
  height: number
}

// Exported because it is a user-facing fact the bundled help states out loud
// ("photos are shrunk to 800px on the longest edge"), and a manual quoting a
// number nothing checks is a manual that goes quietly out of date.
export const PHOTO_MAX_EDGE = 800
const DEFAULT_MAX_EDGE = PHOTO_MAX_EDGE
const DEFAULT_QUALITY = 0.8

export function computeTargetDimensions(
  width: number,
  height: number,
  maxEdge: number = DEFAULT_MAX_EDGE
): Dimensions {
  const longestEdge = Math.max(width, height)
  if (longestEdge <= maxEdge) return { width, height }

  const scale = maxEdge / longestEdge
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

export interface ResizeOptions {
  maxEdge?: number
  quality?: number
}

export async function resizeAndCompressImage(
  input: Blob,
  options: ResizeOptions = {}
): Promise<Blob> {
  const { maxEdge = DEFAULT_MAX_EDGE, quality = DEFAULT_QUALITY } = options

  const bitmap = await createImageBitmap(input)
  const { width, height } = computeTargetDimensions(
    bitmap.width,
    bitmap.height,
    maxEdge
  )

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.drawImage(bitmap, 0, 0, width, height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image encoding failed")),
      "image/jpeg",
      quality
    )
  })
}

// Every mutation here writes the person's photo list through photoFieldsFor,
// so the legacy scalar can never drift from the array. They all run in one
// transaction with the blob write, because a list entry pointing at a photo row
// that failed to land is a broken avatar the user can't clear.

// Appends. The cover is unchanged unless this is the person's first photo.
export async function addPersonPhoto(
  personId: string,
  blob: Blob,
  mime: string
): Promise<string> {
  const newPhotoId = crypto.randomUUID()

  await db.transaction("rw", db.people, db.photos, async () => {
    const existing = await db.people.get(personId)
    if (!existing) throw new Error(`Person not found: ${personId}`)
    const photo: Photo = { id: newPhotoId, blob, mime }
    await db.photos.add(photo)
    await updatePerson(
      personId,
      photoFieldsFor([...personPhotoIds(existing), newPhotoId])
    )
  })

  return newPhotoId
}

// Replaces the cover, leaving any other photos where they are. This is what the
// person form's "Change photo" means: the form shows one avatar, so it can only
// speak for one photo, and silently discarding the others would be a data loss
// nothing on screen warned about.
export async function setPersonPhoto(
  personId: string,
  blob: Blob,
  mime: string
): Promise<string> {
  const newPhotoId = crypto.randomUUID()

  await db.transaction("rw", db.people, db.photos, async () => {
    const existing = await db.people.get(personId)
    const currentIds = personPhotoIds(existing)
    const previousCover = currentIds[0]

    const photo: Photo = { id: newPhotoId, blob, mime }
    await db.photos.add(photo)
    await updatePerson(
      personId,
      photoFieldsFor([newPhotoId, ...currentIds.slice(1)])
    )
    if (previousCover && previousCover !== newPhotoId) {
      await db.photos.delete(previousCover)
    }
  })

  return newPhotoId
}

export async function removePersonPhotoById(
  personId: string,
  photoId: string
): Promise<void> {
  await db.transaction("rw", db.people, db.photos, async () => {
    const existing = await db.people.get(personId)
    const currentIds = personPhotoIds(existing)
    if (!currentIds.includes(photoId)) return
    await updatePerson(
      personId,
      photoFieldsFor(withoutPhotoId(currentIds, photoId))
    )
    await db.photos.delete(photoId)
  })
}

// Removes the cover only, promoting the next photo in line. The form's "Remove
// photo" counterpart to setPersonPhoto above.
export async function removePersonPhoto(personId: string): Promise<void> {
  const existing = await db.people.get(personId)
  const cover = personPhotoIds(existing)[0]
  if (!cover) return
  await removePersonPhotoById(personId, cover)
}

export async function setPersonCoverPhoto(
  personId: string,
  photoId: string
): Promise<void> {
  await db.transaction("rw", db.people, async () => {
    const existing = await db.people.get(personId)
    const currentIds = personPhotoIds(existing)
    const next = withCoverPhotoId(currentIds, photoId)
    if (next === currentIds) return
    await updatePerson(personId, photoFieldsFor(next))
  })
}

// Takes the whole order rather than a from/to pair so a caller that recomputed
// the list can write it in one go. Refuses an order that isn't a permutation of
// what the person actually has: a stale list would otherwise drop photos, or
// point at blobs belonging to someone else.
export async function setPersonPhotoOrder(
  personId: string,
  orderedIds: string[]
): Promise<void> {
  await db.transaction("rw", db.people, async () => {
    const existing = await db.people.get(personId)
    const currentIds = personPhotoIds(existing)
    const sameSet =
      orderedIds.length === currentIds.length &&
      new Set(orderedIds).size === orderedIds.length &&
      orderedIds.every((id) => currentIds.includes(id))
    if (!sameSet) return
    await updatePerson(personId, photoFieldsFor(orderedIds))
  })
}

// Re-encoding a JPEG is lossy every time, so a pass that saves a handful of
// bytes spends real image quality for nothing. Below this fraction the original
// is kept — the point of the action is reclaiming space, and there is none here.
export const RECOMPRESS_MIN_SAVING = 0.05

export function shouldKeepRecompressed(
  before: number,
  after: number,
  minSaving: number = RECOMPRESS_MIN_SAVING
): boolean {
  if (before <= 0 || after <= 0) return false
  return (before - after) / before >= minSaving
}

export interface RecompressResult {
  photoId: string
  before: number
  after: number
  // False means the original was kept, either because re-encoding didn't shrink
  // it enough to be worth the quality loss or because it couldn't be decoded.
  replaced: boolean
}

export interface RecompressOptions extends ResizeOptions {
  minSaving?: number
  // Injected so this is testable without a canvas, and so a caller can supply
  // a different encoder without this module knowing about it.
  encode?: (blob: Blob) => Promise<Blob>
}

// Rewrites the blob in place, keeping the same photo id. The id is what
// Person.photoId points at, so replacing the row rather than the blob would
// mean touching every person that references it — and a photo shared by two
// people (possible in a hand-edited backup) would only get one of them updated.
export async function recompressPhoto(
  photoId: string,
  options: RecompressOptions = {}
): Promise<RecompressResult | undefined> {
  const {
    minSaving,
    encode = (blob: Blob) => resizeAndCompressImage(blob, options),
  } = options

  const photo = await db.photos.get(photoId)
  if (!photo) return undefined

  const before = photo.blob.size
  let encoded: Blob
  try {
    encoded = await encode(photo.blob)
  } catch {
    // A photo the browser can't decode — a HEIC on a browser without support,
    // or a truncated blob from a damaged import. Leaving it exactly as it was
    // is the only safe answer: the bytes may still be recoverable elsewhere.
    return { photoId, before, after: before, replaced: false }
  }

  if (!shouldKeepRecompressed(before, encoded.size, minSaving)) {
    return { photoId, before, after: encoded.size, replaced: false }
  }

  await db.photos.put({
    ...photo,
    blob: encoded,
    mime: encoded.type || photo.mime,
  })
  return { photoId, before, after: encoded.size, replaced: true }
}

export interface RecompressAllResult {
  considered: number
  replaced: number
  bytesBefore: number
  bytesAfter: number
}

// Sequential on purpose. Each step decodes a full-size bitmap, and running
// thirty of those at once is how a phone browser tab gets killed — the exact
// data-loss failure this whole phase exists to avoid.
export async function recompressAllPhotos(
  options: RecompressOptions & {
    onProgress?: (done: number, total: number) => void
  } = {}
): Promise<RecompressAllResult> {
  const { onProgress, ...recompressOptions } = options
  const ids = (await db.photos.toCollection().primaryKeys()) as string[]

  const summary: RecompressAllResult = {
    considered: 0,
    replaced: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  }

  for (const [index, id] of ids.entries()) {
    const result = await recompressPhoto(id, recompressOptions)
    onProgress?.(index + 1, ids.length)
    if (!result) continue
    summary.considered += 1
    summary.bytesBefore += result.before
    summary.bytesAfter += result.replaced ? result.after : result.before
    if (result.replaced) summary.replaced += 1
  }

  return summary
}
