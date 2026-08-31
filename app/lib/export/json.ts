import { db } from "~/lib/db/db"
import { buildBackupZip, parseBackupFile } from "~/lib/export/archive"
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

export async function importBackup(file: Blob): Promise<ImportBackupResult> {
  const backup = await parseBackupFile(file)

  // Leaving a photoId pointing at a photo that didn't survive the round trip
  // would render fine (PersonAvatar falls back), but the restored database
  // would be permanently inconsistent. Only rebuild the array when it matters.
  const missing = new Set(backup.missingPhotoIds)
  const people: Person[] = missing.size
    ? backup.people.map((person) =>
        person.photoId && missing.has(person.photoId)
          ? { ...person, photoId: undefined }
          : person
      )
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
        db.photos.clear(),
      ])

      await Promise.all([
        db.people.bulkAdd(people),
        db.relationships.bulkAdd(backup.relationships),
        db.trees.bulkAdd(backup.trees),
        db.members.bulkAdd(backup.members),
        db.photos.bulkAdd(backup.photos),
      ])
    }
  )

  return {
    schema: backup.schema,
    counts: {
      people: people.length,
      relationships: backup.relationships.length,
      trees: backup.trees.length,
      members: backup.members.length,
      photos: backup.photos.length,
    },
    missingPhotoIds: backup.missingPhotoIds,
  }
}
