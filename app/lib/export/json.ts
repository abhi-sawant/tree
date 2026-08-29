import { db } from "~/lib/db/db"
import { BackupEnvelopeSchema, type BackupEnvelope } from "~/lib/schemas"
import type { Photo } from "~/lib/types"

export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidBackupError"
  }
}

// FileReader (not Blob.arrayBuffer(), which jsdom's test-environment Blob lacks) works
// identically across real browsers and jsdom, since both implement it against Blob/File.
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob"))
    reader.readAsArrayBuffer(blob)
  })
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blobToArrayBuffer(blob))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function exportBackup(): Promise<Blob> {
  const [people, relationships, trees, members, photos] = await Promise.all([
    db.people.toArray(),
    db.relationships.toArray(),
    db.trees.toArray(),
    db.members.toArray(),
    db.photos.toArray(),
  ])

  const backupPhotos = await Promise.all(
    photos.map(async (photo) => ({
      id: photo.id,
      mime: photo.mime,
      data: await blobToBase64(photo.blob),
    }))
  )

  const envelope: BackupEnvelope = {
    schema: 1,
    people,
    relationships,
    trees,
    members,
    photos: backupPhotos,
  }

  return new Blob([JSON.stringify(envelope)], { type: "application/json" })
}

export async function importBackup(file: Blob): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new InvalidBackupError(
      "Not a valid backup file — the file isn't valid JSON."
    )
  }

  const result = BackupEnvelopeSchema.safeParse(parsed)
  if (!result.success) {
    const schemaValue =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).schema
        : undefined
    if (schemaValue !== 1) {
      throw new InvalidBackupError(
        `Unsupported backup version (${JSON.stringify(schemaValue)}) — this file needs schema version 1.`
      )
    }
    throw new InvalidBackupError(
      "Not a valid backup file — the file doesn't match the expected structure."
    )
  }

  const envelope = result.data
  const photos: Photo[] = envelope.photos.map((photo) => ({
    id: photo.id,
    mime: photo.mime,
    blob: base64ToBlob(photo.data, photo.mime),
  }))

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
        db.people.bulkAdd(envelope.people),
        db.relationships.bulkAdd(envelope.relationships),
        db.trees.bulkAdd(envelope.trees),
        db.members.bulkAdd(envelope.members),
        db.photos.bulkAdd(photos),
      ])
    }
  )
}
