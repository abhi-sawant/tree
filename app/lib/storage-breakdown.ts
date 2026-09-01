import { personDisplayName } from "~/lib/person-name"
import { personPhotoIds } from "~/lib/person-photos"
import type { Person } from "~/lib/types"

// Only the fields this module needs. A Photo carries a Blob, and reading
// `blob.size` at the call site keeps this module pure — and testable without
// having to construct Blobs.
export interface PhotoSize {
  id: string
  mime: string
  size: number
}

export interface PhotoUsage {
  photoId: string
  mime: string
  size: number
  // Absent means no person points at this photo. Not an error the user caused:
  // an import interrupted part-way through can leave one behind.
  personId?: string
  name?: string
}

export interface StorageBreakdown {
  photoCount: number
  photoBytes: number
  orphanCount: number
  orphanBytes: number
  // Descending by size, capped. The point is "which photos are worth acting
  // on", and a full list of 300 thumbnails answers nothing.
  largest: PhotoUsage[]
}

const DEFAULT_LIMIT = 10

export interface BreakdownOptions {
  limit?: number
}

export function buildStorageBreakdown(
  photos: PhotoSize[],
  people: Pick<
    Person,
    "id" | "photoId" | "photoIds" | "givenName" | "familyName" | "nickname"
  >[],
  options: BreakdownOptions = {}
): StorageBreakdown {
  const { limit = DEFAULT_LIMIT } = options

  // Keyed by photo, not by person: two people sharing one photoId is not
  // something the app creates, but a hand-edited or merged backup can, and
  // counting those bytes twice would overstate usage.
  const ownerByPhotoId = new Map<string, Person["id"]>()
  const nameByPhotoId = new Map<string, string>()
  for (const person of people) {
    for (const photoId of personPhotoIds(person)) {
      if (ownerByPhotoId.has(photoId)) continue
      ownerByPhotoId.set(photoId, person.id)
      nameByPhotoId.set(photoId, personDisplayName(person))
    }
  }

  let photoBytes = 0
  let orphanCount = 0
  let orphanBytes = 0
  const usages: PhotoUsage[] = []

  for (const photo of photos) {
    photoBytes += photo.size
    const personId = ownerByPhotoId.get(photo.id)
    if (personId === undefined) {
      orphanCount += 1
      orphanBytes += photo.size
    }
    usages.push({
      photoId: photo.id,
      mime: photo.mime,
      size: photo.size,
      personId,
      name: nameByPhotoId.get(photo.id),
    })
  }

  // Tie-broken on id so the list doesn't reshuffle between renders when
  // several photos happen to compress to the same size.
  usages.sort((a, b) => b.size - a.size || a.photoId.localeCompare(b.photoId))

  return {
    photoCount: photos.length,
    photoBytes,
    orphanCount,
    orphanBytes,
    largest: usages.slice(0, limit),
  }
}

const UNITS = ["B", "KB", "MB", "GB", "TB"]

// Base 1000, matching what every OS file browser shows, so a number here can
// be compared with the same file on disk. One decimal place from MB up: "1.4
// MB" is actionable, "1.43 MB" is noise, and "0.0 KB" for a 40-byte blob is
// worse than "40 B".
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes < 1000) return `${Math.round(bytes)} B`

  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value.toFixed(unit >= 2 ? 1 : 0)} ${UNITS[unit]}`
}

// Rounded to whole percent. A quota estimate is padded by the browser, so a
// figure like "37.4%" claims a precision the input doesn't have.
export function usedPercent(usage: number, quota: number): number {
  if (quota <= 0) return 0
  return Math.min(100, Math.round((usage / quota) * 100))
}
