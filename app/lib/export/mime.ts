const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg", // non-standard, but real files carry it
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/tiff": "tif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/svg+xml": "svg",
  // Not a photo format. Document attachments share this table because they
  // share the archive-naming problem, and a second near-identical map is how
  // two places start disagreeing about what a .pdf is called.
  "application/pdf": "pdf",
}

// resizeAndCompressImage always re-encodes to JPEG, so today this always
// returns "jpg" — but Photo.mime is persisted, so a backup from an older or
// forked build could carry anything. Falls back to "bin" rather than "jpg":
// naming a WebP ".jpg" would make the archive lie about its own contents, and
// import reads the authoritative mime from the manifest anyway.
export function extensionForMime(mime: string): string {
  const normalized = mime.split(";")[0].trim().toLowerCase()
  return EXTENSION_BY_MIME[normalized] ?? "bin"
}

// GEDCOM 5.5.1's MULTIMEDIA_FORMAT enumeration is bmp|gif|jpg|ole|pcx|tif|wav,
// but every real importer also accepts png/webp. Unlike extensionForMime this
// falls back to "jpg": an unrecognised FORM makes some importers drop the
// whole OBJE, and in practice the bytes really are JPEG.
const GEDCOM_FORM_BY_EXTENSION: Record<string, string> = {
  jpg: "jpg",
  png: "png",
  gif: "gif",
  bmp: "bmp",
  tif: "tif",
  webp: "webp",
}

export function gedcomFormForExtension(extension: string): string {
  return GEDCOM_FORM_BY_EXTENSION[extension] ?? "jpg"
}
