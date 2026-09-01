import { db } from "~/lib/db/db"
import type { PhotoSize } from "~/lib/storage-breakdown"

// Measuring photos means touching every blob, which makes this the most
// memory-hungry read in the app. Cursoring with `each` and keeping only the
// three fields that matter means one blob is live at a time rather than the
// whole library — the difference between a few kilobytes and tens of megabytes
// on a tree with a photo per person.
//
// Called on request rather than through a liveQuery for the same reason: a
// reactive subscription would re-read everything on every unrelated edit.
export async function readPhotoSizes(): Promise<PhotoSize[]> {
  const sizes: PhotoSize[] = []
  await db.photos.each((photo) => {
    sizes.push({ id: photo.id, mime: photo.mime, size: photo.blob.size })
  })
  return sizes
}
