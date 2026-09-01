import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"

import { AnyBackupEnvelopeSchema } from "~/lib/schemas"
import { extensionForMime } from "~/lib/export/mime"
import type {
  Attachment,
  Person,
  Photo,
  Relationship,
  Tree,
  TreeMember,
} from "~/lib/types"

export const BACKUP_MANIFEST = "backup.json"
export const BACKUP_PHOTO_DIR = "photos"
export const BACKUP_ATTACHMENT_DIR = "attachments"

// DEFLATE for the manifest (JSON compresses ~10x); STORE for photos, which are
// already-compressed JPEG — re-deflating them costs CPU for roughly nothing.
export type ZipLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
const DEFLATE: ZipLevel = 6
const STORE: ZipLevel = 0

export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidBackupError"
  }
}

export interface BackupPayload {
  people: Person[]
  relationships: Relationship[]
  trees: Tree[]
  members: TreeMember[]
  photos: Photo[]
  // Optional so a caller that predates documents — and createSnapshot, which
  // deliberately leaves them out — needs no change.
  attachments?: Attachment[]
}

export interface ParsedBackup extends BackupPayload {
  schema: 1 | 2
  attachments: Attachment[]
  // Photos the manifest referenced but the archive didn't contain. Import
  // continues without them rather than failing the whole restore.
  missingPhotoIds: string[]
  // The same, for documents. Reported separately because the two are separate
  // losses: a missing photo leaves a default avatar, a missing document leaves
  // a certificate the family no longer has a copy of.
  missingAttachmentIds: string[]
}

export async function blobToBytes(
  blob: Blob
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.arrayBuffer())
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export type ZipEntries = Record<string, [Uint8Array, ZipLevel]>

// fflate defaults each entry's mtime to "now", which would make two exports of
// identical data differ byte-for-byte. Taking the date as an argument keeps
// archives reproducible and testable. Note the DOS timestamp in a zip can't
// represent anything before 1980 — fflate throws on e.g. new Date(0).
export function zipEntries(entries: ZipEntries, mtime: Date): Blob {
  const zippable = Object.fromEntries(
    Object.entries(entries).map(([path, [bytes, level]]) => [
      path,
      [bytes, { level, mtime }] as [
        Uint8Array,
        { level: ZipLevel; mtime: Date },
      ],
    ])
  )
  return new Blob([zipSync(zippable)], { type: "application/zip" })
}

// Photo ids are crypto.randomUUID() today, but an id from an imported backup is
// untrusted — keep it to characters that are safe as an archive entry name.
function safeStem(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_") || "photo"
}

const ZIP_LOCAL_HEADER = 0x04034b50 // "PK\x03\x04"
const ZIP_EMPTY_EOCD = 0x06054b50 // "PK\x05\x06" — an empty archive
const ZIP_SPANNED = 0x08074b50 // "PK\x07\x08"

// Sniffs the magic bytes rather than trusting file.type or the extension:
// Windows reports zips as application/x-zip-compressed, and a drag-dropped or
// renamed file often reports no type at all.
export async function looksLikeZip(file: Blob): Promise<boolean> {
  if (file.size < 4) return false
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const signature = head[0] | (head[1] << 8) | (head[2] << 16) | (head[3] << 24)
  return (
    signature === ZIP_LOCAL_HEADER ||
    signature === ZIP_EMPTY_EOCD ||
    signature === ZIP_SPANNED
  )
}

export async function buildBackupZip(
  payload: BackupPayload,
  now: Date = new Date()
): Promise<Blob> {
  const entries: ZipEntries = {}
  const manifestPhotos = []

  for (const photo of payload.photos) {
    const file = `${BACKUP_PHOTO_DIR}/${safeStem(photo.id)}.${extensionForMime(photo.mime)}`
    entries[file] = [await blobToBytes(photo.blob), STORE]
    manifestPhotos.push({ id: photo.id, mime: photo.mime, file })
  }

  // STORE for the same reason photos use it where they are already compressed;
  // DEFLATE where they aren't. A PDF is usually already compressed internally,
  // an uncompressed TIFF scan very much isn't, and guessing wrong either way
  // only costs a little CPU.
  const manifestAttachments = []
  for (const attachment of payload.attachments ?? []) {
    const file = `${BACKUP_ATTACHMENT_DIR}/${safeStem(attachment.id)}.${extensionForMime(attachment.mime)}`
    entries[file] = [
      await blobToBytes(attachment.blob),
      attachment.mime === "application/pdf" ? STORE : DEFLATE,
    ]
    manifestAttachments.push({
      id: attachment.id,
      personId: attachment.personId,
      name: attachment.name,
      mime: attachment.mime,
      size: attachment.size,
      addedAt: attachment.addedAt,
      file,
    })
  }

  const manifest = {
    schema: 2 as const,
    exportedAt: now.toISOString(),
    people: payload.people,
    relationships: payload.relationships,
    trees: payload.trees,
    members: payload.members,
    photos: manifestPhotos,
    attachments: manifestAttachments,
  }
  entries[BACKUP_MANIFEST] = [strToU8(JSON.stringify(manifest)), DEFLATE]

  return zipEntries(entries, now)
}

export async function parseBackupFile(file: Blob): Promise<ParsedBackup> {
  if (file.size === 0) throw new InvalidBackupError("That file is empty.")

  return (await looksLikeZip(file))
    ? parseZipBackup(await blobToBytes(file))
    : parseJsonBackup(await file.text())
}

// Users unzip a backup, look inside, and re-zip it — which nests everything
// under a folder and adds __MACOSX/ siblings. Find the manifest wherever it
// landed and resolve photo paths against its directory.
function findManifestPath(paths: string[]): string | undefined {
  return paths
    .filter(
      (path) =>
        !path.startsWith("__MACOSX/") &&
        (path === BACKUP_MANIFEST || path.endsWith(`/${BACKUP_MANIFEST}`))
    )
    .sort((a, b) => a.length - b.length)[0]
}

function parseZipBackup(bytes: Uint8Array): ParsedBackup {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new InvalidBackupError(
      "This .zip file is damaged and couldn't be opened."
    )
  }

  const paths = Object.keys(entries)
  const manifestPath = findManifestPath(paths)
  if (!manifestPath) {
    if (paths.some((path) => path.toLowerCase().endsWith(".ged"))) {
      throw new InvalidBackupError(
        "This looks like a GEDCOM export, not a backup. GEDCOM files can't be imported yet."
      )
    }
    throw new InvalidBackupError(
      `This .zip isn't a Family Tree backup — it has no ${BACKUP_MANIFEST}.`
    )
  }

  const prefix = manifestPath.slice(0, -BACKUP_MANIFEST.length)

  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(readEntry(entries, manifestPath)!))
  } catch {
    throw new InvalidBackupError(
      `The backup inside this .zip is damaged — ${BACKUP_MANIFEST} isn't valid JSON.`
    )
  }

  const envelope = parseEnvelope(parsed, "The backup inside this .zip is ")

  // A schema-1 manifest is self-contained (base64), so a zipped-up legacy
  // backup imports fine too.
  // Schema 1 predates documents entirely, so there are never any to look for.
  if (envelope.schema === 1) return { ...decodeV1(envelope), schema: 1 }

  const photos: Photo[] = []
  const missingPhotoIds: string[] = []
  for (const photo of envelope.photos) {
    const bytes = readEntry(entries, prefix + photo.file)
    if (!bytes) {
      missingPhotoIds.push(photo.id)
      continue
    }
    photos.push({
      id: photo.id,
      mime: photo.mime,
      blob: new Blob([bytes], { type: photo.mime }),
    })
  }

  const attachments: Attachment[] = []
  const missingAttachmentIds: string[] = []
  for (const attachment of envelope.attachments) {
    const bytes = readEntry(entries, prefix + attachment.file)
    if (!bytes) {
      missingAttachmentIds.push(attachment.id)
      continue
    }
    const blob = new Blob([bytes], { type: attachment.mime })
    attachments.push({
      id: attachment.id,
      personId: attachment.personId,
      name: attachment.name,
      mime: attachment.mime,
      // Measured from what actually came out of the archive rather than
      // trusted from the manifest: the manifest is the thing that could be
      // wrong, and the storage panel would then report a number that doesn't
      // match the bytes on disk.
      size: blob.size,
      addedAt: attachment.addedAt,
      blob,
    })
  }

  return {
    schema: 2,
    people: envelope.people,
    relationships: envelope.relationships,
    trees: envelope.trees,
    members: envelope.members,
    photos,
    attachments,
    missingPhotoIds,
    missingAttachmentIds,
  }
}

// fflate returns a plain {}, so an archive entry literally named "__proto__"
// or "constructor" would otherwise resolve to something off Object.prototype.
function readEntry(
  entries: Record<string, Uint8Array>,
  path: string
): Uint8Array<ArrayBuffer> | undefined {
  if (!Object.prototype.hasOwnProperty.call(entries, path)) return undefined
  const bytes = entries[path]
  // fflate never hands back a view over a SharedArrayBuffer, which is the only
  // thing the wider Uint8Array<ArrayBufferLike> adds over what Blob accepts.
  return bytes instanceof Uint8Array
    ? (bytes as Uint8Array<ArrayBuffer>)
    : undefined
}

function parseJsonBackup(text: string): ParsedBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new InvalidBackupError(
      "Not a valid backup file — it isn't a .zip backup and isn't valid JSON."
    )
  }

  const envelope = parseEnvelope(parsed, "Not a valid backup file — ")

  // Rejected even when photos is empty: this file came out of a .zip, so the
  // user has the archive, and silently importing the manifest alone would drop
  // every photo while reporting success.
  if (envelope.schema === 2) {
    throw new InvalidBackupError(
      `This is the ${BACKUP_MANIFEST} from inside a .zip backup — choose the .zip file itself, not a file extracted from it.`
    )
  }

  return { ...decodeV1(envelope), schema: 1 }
}

function parseEnvelope(parsed: unknown, prefix: string) {
  const result = AnyBackupEnvelopeSchema.safeParse(parsed)
  if (result.success) return result.data

  const schema =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).schema
      : undefined
  if (schema !== 1 && schema !== 2) {
    throw new InvalidBackupError(
      `Unsupported backup version (${JSON.stringify(schema)}) — this file needs schema version 1 or 2.`
    )
  }
  throw new InvalidBackupError(
    `${prefix}the file doesn't match the expected structure.`
  )
}

function decodeV1(envelope: {
  people: Person[]
  relationships: Relationship[]
  trees: Tree[]
  members: TreeMember[]
  photos: { id: string; mime: string; data: string }[]
}): Omit<ParsedBackup, "schema"> {
  return {
    people: envelope.people,
    relationships: envelope.relationships,
    trees: envelope.trees,
    members: envelope.members,
    photos: envelope.photos.map((photo) => ({
      id: photo.id,
      mime: photo.mime,
      blob: base64ToBlob(photo.data, photo.mime),
    })),
    attachments: [],
    missingPhotoIds: [],
    missingAttachmentIds: [],
  }
}
