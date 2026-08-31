import { db } from "~/lib/db/db"
import { updatePerson } from "~/lib/db/people"
import type { Photo } from "~/lib/types"

export interface Dimensions {
  width: number
  height: number
}

const DEFAULT_MAX_EDGE = 800
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

export async function setPersonPhoto(
  personId: string,
  blob: Blob,
  mime: string
): Promise<string> {
  const newPhotoId = crypto.randomUUID()

  await db.transaction("rw", db.people, db.photos, async () => {
    const existing = await db.people.get(personId)
    const photo: Photo = { id: newPhotoId, blob, mime }
    await db.photos.add(photo)
    await updatePerson(personId, { photoId: newPhotoId })
    if (existing?.photoId && existing.photoId !== newPhotoId) {
      await db.photos.delete(existing.photoId)
    }
  })

  return newPhotoId
}

export async function removePersonPhoto(personId: string): Promise<void> {
  await db.transaction("rw", db.people, db.photos, async () => {
    const existing = await db.people.get(personId)
    if (!existing?.photoId) return
    await updatePerson(personId, { photoId: undefined })
    await db.photos.delete(existing.photoId)
  })
}
