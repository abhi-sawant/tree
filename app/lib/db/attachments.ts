import {
  attachmentProblem,
  resolveAttachmentMime,
  type AttachmentCandidate,
} from "~/lib/attachments"
import { db } from "~/lib/db/db"
import { requestPersistentStorage } from "~/lib/storage"
import type { Attachment } from "~/lib/types"

export class AttachmentRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AttachmentRejectedError"
  }
}

export interface AddAttachmentOptions {
  now?: number
  maxBytes?: number
}

// Takes a Blob plus the descriptive fields rather than a File, so this is
// testable without one and so a caller that has already renamed a file isn't
// forced to reconstruct a File to say so.
export async function addAttachment(
  personId: string,
  blob: Blob,
  candidate: AttachmentCandidate,
  options: AddAttachmentOptions = {}
): Promise<Attachment> {
  const problem = attachmentProblem(candidate, options.maxBytes)
  if (problem) throw new AttachmentRejectedError(problem)

  const person = await db.people.get(personId)
  if (!person) throw new Error(`Person not found: ${personId}`)

  const attachment: Attachment = {
    id: crypto.randomUUID(),
    personId,
    name: candidate.name,
    // Stored resolved, not as reported: a file whose type the browser left
    // blank would otherwise come back out of a backup as an unopenable blob.
    mime: resolveAttachmentMime(candidate.name, candidate.type),
    blob,
    size: blob.size,
    addedAt: options.now ?? Date.now(),
  }
  await db.attachments.add(attachment)
  void requestPersistentStorage()
  return attachment
}

// Sorted oldest first, so the drawer reads in the order things were filed and a
// newly added document appears at the bottom rather than jumping the list.
export async function listAttachments(personId: string): Promise<Attachment[]> {
  const rows = await db.attachments.where("personId").equals(personId).toArray()
  return rows.sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id))
}

export async function renameAttachment(
  id: string,
  name: string
): Promise<void> {
  const trimmed = name.trim()
  // A blank name would leave a row nothing on screen identifies, and no
  // sensible name to download it under. Keeping the old one is the safe answer.
  if (!trimmed) return
  await db.attachments.update(id, { name: trimmed })
}

export async function deleteAttachment(id: string): Promise<void> {
  await db.attachments.delete(id)
}

export async function deleteAttachmentsForPerson(
  personId: string
): Promise<number> {
  return db.attachments.where("personId").equals(personId).delete()
}

// Only the fields the storage panel needs, read without holding every blob in
// memory at once — the same reason readPhotoSizes cursors rather than
// toArray()s. `size` is denormalised on the row, so this never touches a blob
// at all.
export async function readAttachmentSizes(): Promise<AttachmentSize[]> {
  const sizes: AttachmentSize[] = []
  await db.attachments.each((attachment) => {
    sizes.push({
      id: attachment.id,
      personId: attachment.personId,
      name: attachment.name,
      mime: attachment.mime,
      size: attachment.size,
    })
  })
  return sizes
}

export interface AttachmentSize {
  id: string
  personId: string
  name: string
  mime: string
  size: number
}
