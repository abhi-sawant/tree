import { listAttachments } from "~/lib/db/attachments"
import { db } from "~/lib/db/db"
import { buildFamilyBook } from "~/lib/export/family-book"
import { renderFamilyBookPdf } from "~/lib/export/family-book-pdf"
import {
  redactionNote,
  redactPool,
  type RedactionOptions,
} from "~/lib/export/redaction"
import { coverPhotoId } from "~/lib/person-photos"
import type { Person, Relationship, Tree } from "~/lib/types"

// Assembles the book from the database and hands it to the renderer. Kept out
// of both the pure model and the renderer so neither has to know about Dexie,
// and out of the shell so the shell doesn't grow a data layer.

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"))
    reader.readAsDataURL(blob)
  })
}

export interface FamilyBookExportInput {
  tree: Tree
  // The tree's members, not the whole pool. A book is of *this* family: `D14`
  // scopes file exports pool-wide because they are copies of the data, but this
  // is a document about a family, and the same argument that scopes statistics
  // to the open tree applies.
  people: Person[]
  relationships: Relationship[]
  generations: ReadonlyMap<string, number>
  now?: Date
  // Withhold the details of anyone who may still be living. A book is the
  // export most likely to be handed to somebody outside the family, so this
  // matters here more than anywhere.
  redactLiving?: boolean
  redaction?: RedactionOptions
}

export async function buildFamilyBookPdf(
  input: FamilyBookExportInput
): Promise<Blob> {
  const { tree, generations, now = new Date() } = input

  // Redacted before anything else reads them, so the photo gathering and the
  // document listing below both see the withheld version and neither has to
  // remember to check.
  const redacted = input.redactLiving
    ? redactPool(input.people, input.relationships, input.redaction)
    : undefined
  const people = redacted?.people ?? input.people
  const relationships = redacted?.relationships ?? input.relationships

  // Only the covers, and only one read each: a book shows one face per page, so
  // pulling every photo of every person would multiply the work by the size of
  // the largest gallery for nothing.
  const coverIds = [
    ...new Set(
      people
        .map((person) => coverPhotoId(person))
        .filter((id): id is string => !!id)
    ),
  ]
  const photoDataUrls = new Map<string, string>()
  for (const photoId of coverIds) {
    const photo = await db.photos.get(photoId)
    if (!photo) continue
    try {
      photoDataUrls.set(photoId, await blobToDataUrl(photo.blob))
    } catch {
      // A photo that won't read leaves that page without a picture rather than
      // failing the whole book.
    }
  }

  const documentNames = new Map<string, string[]>()
  for (const person of people) {
    // A document's filename is often the person's own name and a date — "Nia
    // Sawant birth certificate 1991.pdf" — so listing one against a redacted
    // page would undo the redaction in the most direct way possible.
    if (redacted?.redactedIds.has(person.id)) continue
    const attachments = await listAttachments(person.id)
    if (attachments.length > 0) {
      documentNames.set(
        person.id,
        attachments.map((attachment) => attachment.name)
      )
    }
  }

  const book = buildFamilyBook({
    title: tree.name,
    people,
    relationships,
    generations,
    documentNames,
  })

  return renderFamilyBookPdf({
    book,
    generatedDate: now,
    photoDataUrls,
    redactionNote: redacted?.redactedIds.size
      ? redactionNote(redacted.redactedIds.size)
      : undefined,
  })
}
