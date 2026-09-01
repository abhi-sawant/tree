import { db } from "~/lib/db/db"
import { personPhotoIds, photoFieldsFor } from "~/lib/person-photos"
import {
  buildBackupZip,
  parseBackupFile,
  type ParsedBackup,
} from "~/lib/export/archive"
import type { Person } from "~/lib/types"

export { InvalidBackupError } from "~/lib/export/archive"

export interface ImportBackupResult {
  schema: 1 | 2
  counts: {
    people: number
    relationships: number
    trees: number
    members: number
    photos: number
  }
  // Referenced by the backup but absent from it. Those people keep their data
  // and fall back to the default avatar.
  missingPhotoIds: string[]
}

// appMeta is deliberately excluded: lastExportDate records when *this* browser
// last exported, which an imported file has no business overwriting.
export async function exportBackup(now: Date = new Date()): Promise<Blob> {
  const [people, relationships, trees, members, photos] = await Promise.all([
    db.people.toArray(),
    db.relationships.toArray(),
    db.trees.toArray(),
    db.members.toArray(),
    db.photos.toArray(),
  ])

  return buildBackupZip({ people, relationships, trees, members, photos }, now)
}

export interface ApplyBackupOptions {
  // "replace" wipes the photo table and restores the archive's photos — what a
  // backup file means. "keep" leaves the photo table alone, for a restore whose
  // archive deliberately carries no photos (see lib/backup/snapshots.ts); any
  // restored person pointing at a photo this browser no longer holds has the
  // reference cleared rather than left dangling.
  photos?: "replace" | "keep"
}

// Shared by the file-import path and the snapshot-restore path so the two cannot
// disagree about what "replace everything" means, and so both get the same
// all-or-nothing transaction.
export async function applyBackup(
  backup: ParsedBackup,
  options: ApplyBackupOptions = {}
): Promise<{ people: Person[]; missingPhotoIds: string[] }> {
  const { photos: photoMode = "replace" } = options

  const knownPhotoIds =
    photoMode === "replace"
      ? new Set(backup.photos.map((photo) => photo.id))
      : new Set((await db.photos.toCollection().primaryKeys()) as string[])

  // Leaving a photo reference pointing at a photo that isn't there would render
  // fine (PersonAvatar falls back), but the restored database would be
  // permanently inconsistent. A person can hold several photos, so this drops
  // the missing ones and keeps the rest — losing one photo out of four must not
  // cost the other three. Only rebuild the array when it actually matters.
  const missing = new Set<string>()
  for (const person of backup.people) {
    for (const photoId of personPhotoIds(person)) {
      if (!knownPhotoIds.has(photoId)) missing.add(photoId)
    }
  }
  const people: Person[] = missing.size
    ? backup.people.map((person) => {
        const kept = personPhotoIds(person).filter((id) => !missing.has(id))
        return kept.length === personPhotoIds(person).length
          ? person
          : { ...person, ...photoFieldsFor(kept) }
      })
    : backup.people

  // Every clear and add stays inside one transaction so a failure part-way
  // through — a QuotaExceededError on a large photo set, say — rolls the whole
  // restore back and leaves the existing data untouched.
  await db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.trees,
    db.members,
    db.photos,
    async () => {
      await Promise.all([
        db.people.clear(),
        db.relationships.clear(),
        db.trees.clear(),
        db.members.clear(),
        ...(photoMode === "replace" ? [db.photos.clear()] : []),
      ])

      await Promise.all([
        db.people.bulkAdd(people),
        db.relationships.bulkAdd(backup.relationships),
        db.trees.bulkAdd(backup.trees),
        db.members.bulkAdd(backup.members),
        ...(photoMode === "replace" ? [db.photos.bulkAdd(backup.photos)] : []),
      ])
    }
  )

  return { people, missingPhotoIds: [...missing] }
}

export async function importBackup(file: Blob): Promise<ImportBackupResult> {
  const backup = await parseBackupFile(file)
  const { people, missingPhotoIds } = await applyBackup(backup)

  return {
    schema: backup.schema,
    counts: {
      people: people.length,
      relationships: backup.relationships.length,
      trees: backup.trees.length,
      members: backup.members.length,
      photos: backup.photos.length,
    },
    missingPhotoIds,
  }
}
