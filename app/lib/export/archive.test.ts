import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"

import {
  InvalidBackupError,
  blobToBytes,
  buildBackupZip,
  looksLikeZip,
  parseBackupFile,
  type BackupPayload,
} from "~/lib/export/archive"
import type { Person, Photo } from "~/lib/types"

// Fixed so archives are reproducible. Must be >= 1980: a zip's DOS timestamp
// can't represent anything earlier and fflate throws on e.g. new Date(0).
const EXPORTED_AT = new Date("2026-08-31T10:00:00.000Z")

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "person-1",
    givenName: "Ada",
    familyName: "Lovelace",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }
}

// High-entropy, so a "did this get deflated?" assertion is meaningful — real
// JPEG bytes are already compressed and shouldn't shrink further.
function incompressibleBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  let state = 12345
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    bytes[i] = (state >>> 16) & 0xff
  }
  return bytes
}

function makePhoto(id: string, bytes: Uint8Array<ArrayBuffer>): Photo {
  return {
    id,
    mime: "image/jpeg",
    blob: new Blob([bytes], { type: "image/jpeg" }),
  }
}

function emptyPayload(overrides: Partial<BackupPayload> = {}): BackupPayload {
  return {
    people: [],
    relationships: [],
    trees: [],
    members: [],
    photos: [],
    ...overrides,
  }
}

// Walks the zip's local file headers so we can assert the per-entry
// compression method (0 = stored, 8 = deflated) rather than inferring it.
function localEntries(
  zip: Uint8Array<ArrayBuffer>
): { name: string; method: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const entries: { name: string; method: number }[] = []
  let offset = 0
  while (
    offset + 30 <= zip.byteLength &&
    view.getUint32(offset, true) === 0x04034b50
  ) {
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(
      zip.subarray(offset + 30, offset + 30 + nameLength)
    )
    entries.push({ name, method })
    offset += 30 + nameLength + extraLength + compressedSize
  }
  return entries
}

describe("looksLikeZip", () => {
  it("detects a zip by magic bytes, not by MIME type or extension", async () => {
    const zip = await buildBackupZip(emptyPayload(), EXPORTED_AT)
    // Retyped as JSON the way Windows and drag-and-drop routinely mislabel files.
    const mislabelled = new Blob([await blobToBytes(zip)], {
      type: "application/json",
    })

    expect(await looksLikeZip(mislabelled)).toBe(true)
    expect(await looksLikeZip(new Blob(['{"schema":1}']))).toBe(false)
    expect(await looksLikeZip(new Blob([]))).toBe(false)
  })
})

describe("buildBackupZip", () => {
  it("round-trips photo bytes through the archive unchanged", async () => {
    const bytes = incompressibleBytes(4096)
    const zip = await buildBackupZip(
      emptyPayload({
        people: [makePerson({ photoId: "photo-1" })],
        photos: [makePhoto("photo-1", bytes)],
      }),
      EXPORTED_AT
    )

    expect(zip.type).toBe("application/zip")
    expect([...(await blobToBytes(zip)).slice(0, 4)]).toEqual([
      0x50, 0x4b, 0x03, 0x04,
    ])

    const parsed = await parseBackupFile(zip)
    expect(parsed.schema).toBe(2)
    expect(parsed.missingPhotoIds).toEqual([])
    expect(parsed.photos).toHaveLength(1)
    expect(parsed.photos[0].mime).toBe("image/jpeg")
    expect(new Uint8Array(await parsed.photos[0].blob.arrayBuffer())).toEqual(
      bytes
    )
    expect(parsed.people[0].photoId).toBe("photo-1")
  })

  it("stores photos uncompressed and deflates the manifest", async () => {
    const zip = await buildBackupZip(
      emptyPayload({
        // Enough repetitive rows that the manifest is worth deflating.
        people: Array.from({ length: 200 }, (_, i) =>
          makePerson({ id: `person-${i}` })
        ),
        photos: [makePhoto("photo-1", incompressibleBytes(4096))],
      }),
      EXPORTED_AT
    )
    const bytes = await blobToBytes(zip)
    const entries = localEntries(bytes)

    expect(entries.find((e) => e.name === "photos/photo-1.jpg")?.method).toBe(0)
    expect(entries.find((e) => e.name === "backup.json")?.method).toBe(8)
    // The whole archive is smaller than the manifest alone would be uncompressed.
    expect(bytes.byteLength).toBeLessThan(20_000)
  })

  it("names photo entries from the mime type", async () => {
    const zip = await buildBackupZip(
      emptyPayload({
        photos: [
          { id: "a", mime: "image/png", blob: new Blob([new Uint8Array([1])]) },
          {
            id: "b",
            mime: "image/webp",
            blob: new Blob([new Uint8Array([2])]),
          },
        ],
      }),
      EXPORTED_AT
    )

    const names = localEntries(await blobToBytes(zip)).map((e) => e.name)
    expect(names).toContain("photos/a.png")
    expect(names).toContain("photos/b.webp")
  })

  it("is deterministic for the same data and date", async () => {
    const payload = () =>
      emptyPayload({
        people: [makePerson({ photoId: "photo-1" })],
        photos: [makePhoto("photo-1", incompressibleBytes(512))],
      })

    const first = await blobToBytes(
      await buildBackupZip(payload(), EXPORTED_AT)
    )
    const second = await blobToBytes(
      await buildBackupZip(payload(), EXPORTED_AT)
    )

    expect(first).toEqual(second)
  })
})

describe("parseBackupFile", () => {
  it("skips photos the archive is missing and keeps everything else", async () => {
    const zip = await buildBackupZip(
      emptyPayload({
        people: [
          makePerson({ id: "person-1", photoId: "gone" }),
          makePerson({ id: "person-2", photoId: "kept" }),
        ],
        photos: [
          makePhoto("gone", incompressibleBytes(64)),
          makePhoto("kept", incompressibleBytes(64)),
        ],
      }),
      EXPORTED_AT
    )

    // Rebuild the archive without one photo, as if a file were deleted from it.
    const entries = Object.fromEntries(
      Object.entries(
        (await import("fflate")).unzipSync(await blobToBytes(zip))
      ).filter(([path]) => path !== "photos/gone.jpg")
    )
    const damaged = new Blob([zipSync(entries, { mtime: EXPORTED_AT })])

    const parsed = await parseBackupFile(damaged)
    expect(parsed.missingPhotoIds).toEqual(["gone"])
    expect(parsed.photos.map((p) => p.id)).toEqual(["kept"])
    expect(parsed.people).toHaveLength(2)
  })

  it("resolves a re-zipped archive nested under a folder", async () => {
    const zip = await buildBackupZip(
      emptyPayload({
        people: [makePerson({ photoId: "photo-1" })],
        photos: [makePhoto("photo-1", incompressibleBytes(64))],
      }),
      EXPORTED_AT
    )
    const original = (await import("fflate")).unzipSync(await blobToBytes(zip))

    // What macOS produces when you expand a backup and compress it again.
    const nested = zipSync(
      {
        "__MACOSX/._backup.json": strToU8("junk"),
        ...Object.fromEntries(
          Object.entries(original).map(([path, bytes]) => [
            `family-tree-backup/${path}`,
            bytes,
          ])
        ),
      },
      { mtime: EXPORTED_AT }
    )

    const parsed = await parseBackupFile(new Blob([nested]))
    expect(parsed.schema).toBe(2)
    expect(parsed.missingPhotoIds).toEqual([])
    expect(parsed.photos).toHaveLength(1)
  })

  it("accepts a legacy schema-1 .json backup and decodes its base64 photos", async () => {
    const envelope = JSON.stringify({
      schema: 1,
      people: [makePerson({ photoId: "photo-1" })],
      relationships: [],
      trees: [],
      members: [],
      photos: [
        { id: "photo-1", mime: "image/jpeg", data: btoa("fake-image-bytes") },
      ],
    })

    const parsed = await parseBackupFile(new Blob([envelope]))
    expect(parsed.schema).toBe(1)
    expect(parsed.missingPhotoIds).toEqual([])
    expect(await parsed.photos[0].blob.text()).toBe("fake-image-bytes")
  })

  it("rejects a bare schema-2 manifest extracted from a zip", async () => {
    const manifest = JSON.stringify({
      schema: 2,
      people: [],
      relationships: [],
      trees: [],
      members: [],
      photos: [],
    })

    // Rejected even with no photos: the user demonstrably has the .zip, and
    // importing the manifest alone would silently drop every photo.
    await expect(parseBackupFile(new Blob([manifest]))).rejects.toThrow(
      /choose the \.zip file itself/
    )
  })

  it("reports a damaged archive rather than a structure error", async () => {
    const zip = await buildBackupZip(
      emptyPayload({
        photos: [makePhoto("photo-1", incompressibleBytes(4096))],
      }),
      EXPORTED_AT
    )

    await expect(parseBackupFile(zip.slice(0, 40))).rejects.toThrow(/damaged/)
  })

  it("tells the user when they picked a GEDCOM archive instead of a backup", async () => {
    const gedcom = zipSync(
      { "family-tree-2026-08-31.ged": strToU8("0 HEAD\n0 TRLR\n") },
      { mtime: EXPORTED_AT }
    )

    await expect(parseBackupFile(new Blob([gedcom]))).rejects.toThrow(
      /looks like a GEDCOM export/
    )
  })

  it("rejects a zip that isn't a backup at all", async () => {
    const other = zipSync(
      { "notes.txt": strToU8("hello") },
      { mtime: EXPORTED_AT }
    )

    await expect(parseBackupFile(new Blob([other]))).rejects.toThrow(
      /has no backup\.json/
    )
  })

  it("rejects an empty file, non-JSON, and an unknown schema version", async () => {
    await expect(parseBackupFile(new Blob([]))).rejects.toThrow(/empty/)
    await expect(parseBackupFile(new Blob(["not json"]))).rejects.toThrow(
      InvalidBackupError
    )
    await expect(
      parseBackupFile(new Blob([JSON.stringify({ schema: 99 })]))
    ).rejects.toThrow(/Unsupported backup version \(99\)/)
  })

  it("ignores an archive entry named __proto__ instead of reading off the prototype", async () => {
    const manifest = JSON.stringify({
      schema: 2,
      people: [],
      relationships: [],
      trees: [],
      members: [],
      photos: [{ id: "photo-1", mime: "image/jpeg", file: "photos/a.jpg" }],
    })
    const hostile = zipSync(
      {
        "backup.json": strToU8(manifest),
        __proto__: strToU8("x"),
      },
      { mtime: EXPORTED_AT }
    )

    const parsed = await parseBackupFile(new Blob([hostile]))
    expect(parsed.missingPhotoIds).toEqual(["photo-1"])
    expect(parsed.photos).toEqual([])
  })
})
