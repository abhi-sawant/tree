import { formatBytes } from "~/lib/storage-breakdown"

// What a scan or document may be. PDFs and images cover what people actually
// have: a photographed certificate, a scanned letter, an exported record. The
// list is closed rather than "anything the user picks", because everything in
// here is stored verbatim in a quota that eviction can already wipe out
// (ADR.md D25), and a video dropped in by accident would eat it in one go.
export const ATTACHMENT_MIME_TYPES = ["application/pdf"] as const
export const ATTACHMENT_ACCEPT = "application/pdf,image/*"

// Unlike a photo, an attachment is stored exactly as given. Downscaling is the
// whole reason photos need no cap — and the reason documents do: the point of a
// scan is that the small print is still readable, so re-encoding it would
// destroy the thing it was kept for. 25 MB is roughly a long multi-page colour
// scan, and is stated to the user rather than enforced silently.
export const MAX_ATTACHMENT_BYTES = 25_000_000

// Extensions to fall back on when the browser reports no type at all, which
// happens for files dragged in from some file managers.
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  heic: "image/heic",
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot <= 0 || dot === name.length - 1) return ""
  return name.slice(dot + 1).toLowerCase()
}

// The type to store, which is not always the type the browser reported. An
// empty type is guessed from the extension rather than rejected: a file
// manager that reports nothing is not the user's mistake.
export function resolveAttachmentMime(name: string, reported: string): string {
  const normalized = reported.split(";")[0].trim().toLowerCase()
  if (normalized) return normalized
  return MIME_BY_EXTENSION[extensionOf(name)] ?? ""
}

export function isAcceptedAttachmentMime(mime: string): boolean {
  return (
    mime.startsWith("image/") ||
    (ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime)
  )
}

export interface AttachmentCandidate {
  name: string
  type: string
  size: number
}

// Returns the reason this file can't be stored, or undefined if it can. A
// sentence rather than a code, because every caller shows it verbatim: a
// refusal the reader can't act on is barely better than a silent one, so both
// messages name the file and say what specifically was wrong with it.
export function attachmentProblem(
  file: AttachmentCandidate,
  maxBytes: number = MAX_ATTACHMENT_BYTES
): string | undefined {
  const mime = resolveAttachmentMime(file.name, file.type)
  if (!isAcceptedAttachmentMime(mime)) {
    return `“${file.name}” isn't a PDF or an image, so it wasn't added.`
  }
  if (file.size > maxBytes) {
    return `“${file.name}” is ${formatBytes(file.size)}, over the ${formatBytes(maxBytes)} limit for a single file, so it wasn't added.`
  }
  // A zero-byte file is almost always a failed copy or a truncated download.
  // Storing it would put a row in the list that downloads to nothing.
  if (file.size === 0) {
    return `“${file.name}” is empty, so it wasn't added.`
  }
  return undefined
}

export function isPdfAttachment(mime: string): boolean {
  return mime === "application/pdf"
}
