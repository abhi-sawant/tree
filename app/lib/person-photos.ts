import type { Person } from "~/lib/types"

// A person's photos live in two fields, and this module is the only place that
// knows how they relate.
//
// `photoIds` is the ordered list and the source of truth; its first entry is
// the cover, which is what every single-avatar surface draws. `photoId` is the
// scalar the model carried before a person could have more than one — it stays
// in the schema for two reasons: data already in a browser (or in a backup file
// already in someone's hands) has only that field, and a build older than this
// one importing a new backup would otherwise show every face as the default
// avatar. It is written as a mirror of `photoIds[0]` and never read except by
// `personPhotoIds` below, on data that predates the array.
export type PhotoFields = Pick<Person, "photoId" | "photoIds">

export function personPhotoIds(person: PhotoFields | undefined): string[] {
  if (!person) return []
  // An empty array is a real answer — "this person's photos were all removed" —
  // and must not fall through to the legacy scalar, or a removal would undo
  // itself on the next read.
  if (person.photoIds) return person.photoIds
  return person.photoId ? [person.photoId] : []
}

export function coverPhotoId(
  person: PhotoFields | undefined
): string | undefined {
  return personPhotoIds(person)[0]
}

export function personPhotoCount(person: PhotoFields | undefined): number {
  return personPhotoIds(person).length
}

// The single place both fields are written together, so the mirror cannot drift
// from the list. Every mutation in lib/photos.ts ends in a call to this.
export function photoFieldsFor(photoIds: string[]): PhotoFields {
  return photoIds.length > 0
    ? { photoIds, photoId: photoIds[0] }
    : // Explicit undefined rather than an omitted key: updatePerson spreads the
      // patch over the existing row, so a missing key would leave the old value
      // in place and a removed photo would come back.
      { photoIds: undefined, photoId: undefined }
}

export function withoutPhotoId(photoIds: string[], photoId: string): string[] {
  return photoIds.filter((id) => id !== photoId)
}

// Promotes one photo to cover, leaving the order of the rest alone. A no-op for
// an id the person doesn't have, rather than an error: the gallery and the
// database can be a moment out of step, and inventing a photo is worse than
// ignoring a stale click.
export function withCoverPhotoId(
  photoIds: string[],
  photoId: string
): string[] {
  if (!photoIds.includes(photoId)) return photoIds
  return [photoId, ...withoutPhotoId(photoIds, photoId)]
}

// Moves the photo at `from` so that it lands at index `to`. Out-of-range
// indices leave the order untouched for the same reason.
export function movePhotoId(
  photoIds: string[],
  from: number,
  to: number
): string[] {
  if (from === to) return photoIds
  if (from < 0 || from >= photoIds.length) return photoIds
  if (to < 0 || to >= photoIds.length) return photoIds
  const next = [...photoIds]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
