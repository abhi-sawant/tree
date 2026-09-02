import { unzipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  InvalidBackupError,
  exportBackup,
  importBackup,
} from "~/lib/export/json"
import type { Person, Photo, Relationship, Tree, TreeMember } from "~/lib/types"

const EXPORTED_AT = new Date("2026-08-31T10:00:00.000Z")
const PHOTO_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 250])

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.relationships.clear(),
    db.trees.clear(),
    db.members.clear(),
    db.photos.clear(),
    db.dismissals.clear(),
  ])
})

function makePerson(overrides: Partial<Person> = {}): Person {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    givenName: "Ada",
    familyName: "Lovelace",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    id: crypto.randomUUID(),
    name: "Test Tree",
    rootPersonId: crypto.randomUUID(),
    createdAt: Date.now(),
    ...overrides,
  }
}

function makeTreeMember(overrides: Partial<TreeMember> = {}): TreeMember {
  return {
    treeId: crypto.randomUUID(),
    personId: crypto.randomUUID(),
    ...overrides,
  }
}

// Photos are exercised here for real: vitest.setup.ts patches structuredClone
// so fake-indexeddb stops degrading a jsdom Blob to `{}` on insert.
async function seedFixture() {
  const photo: Photo = {
    id: crypto.randomUUID(),
    mime: "image/jpeg",
    blob: new Blob([PHOTO_BYTES], { type: "image/jpeg" }),
  }
  await db.photos.add(photo)

  const root = makePerson({ givenName: "Root", photoId: photo.id })
  const child = makePerson({ givenName: "Child" })
  await db.people.bulkAdd([root, child])

  const relationship: Relationship = {
    id: crypto.randomUUID(),
    type: "parent-child",
    from: root.id,
    to: child.id,
  }
  await db.relationships.add(relationship)

  const tree = makeTree({ rootPersonId: root.id })
  await db.trees.add(tree)

  const member = makeTreeMember({
    treeId: tree.id,
    personId: root.id,
    x: 10,
    y: 20,
  })
  await db.members.add(member)

  return { root, child, relationship, tree, member, photo }
}

function legacyEnvelope(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema: 1,
    people: [],
    relationships: [],
    trees: [],
    members: [],
    photos: [],
    ...overrides,
  })
}

describe("exportBackup", () => {
  it("produces a zip holding the manifest and every photo as raw bytes", async () => {
    const { photo } = await seedFixture()

    const blob = await exportBackup(EXPORTED_AT)
    expect(blob.type).toBe("application/zip")

    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(entries).sort()).toEqual([
      "backup.json",
      `photos/${photo.id}.jpg`,
    ])

    // The bytes in the archive are the original JPEG, not base64 of it — this
    // is the file a user can open straight out of the unzipped folder.
    expect(entries[`photos/${photo.id}.jpg`]).toEqual(PHOTO_BYTES)

    const manifest = JSON.parse(
      new TextDecoder().decode(entries["backup.json"])
    )
    expect(manifest.schema).toBe(2)
    expect(manifest.exportedAt).toBe(EXPORTED_AT.toISOString())
    expect(manifest.people).toHaveLength(2)
    expect(manifest.relationships).toHaveLength(1)
    expect(manifest.trees).toHaveLength(1)
    expect(manifest.members).toHaveLength(1)
    expect(manifest.photos).toEqual([
      { id: photo.id, mime: "image/jpeg", file: `photos/${photo.id}.jpg` },
    ])
  })
})

describe("importBackup", () => {
  it("round-trips: export then import restores every table exactly", async () => {
    const { root, child, relationship, tree, member, photo } =
      await seedFixture()

    const blob = await exportBackup(EXPORTED_AT)
    const result = await importBackup(blob)

    expect(result.schema).toBe(2)
    expect(result.missingPhotoIds).toEqual([])
    expect(result.counts).toEqual({
      attachments: 0,
      people: 2,
      relationships: 1,
      trees: 1,
      members: 1,
      photos: 1,
    })

    expect(await db.people.get(root.id)).toEqual(root)
    expect(await db.people.get(child.id)).toEqual(child)
    expect(await db.relationships.get(relationship.id)).toEqual(relationship)
    expect(await db.trees.get(tree.id)).toEqual(tree)
    expect(await db.members.get([member.treeId, member.personId])).toEqual(
      member
    )

    // The point of the whole exercise: the photo survives the round trip.
    const restored = await db.photos.get(photo.id)
    expect(restored?.mime).toBe("image/jpeg")
    expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(
      PHOTO_BYTES
    )
  })

  it("clears a photoId whose photo didn't survive, rather than leaving it dangling", async () => {
    const photoId = crypto.randomUUID()
    const person = makePerson({ photoId })
    const manifest = {
      schema: 2,
      people: [person],
      relationships: [],
      trees: [],
      members: [],
      photos: [{ id: photoId, mime: "image/jpeg", file: "photos/gone.jpg" }],
    }
    const { zipSync, strToU8 } = await import("fflate")
    const zip = new Blob([
      zipSync(
        { "backup.json": strToU8(JSON.stringify(manifest)) },
        { mtime: EXPORTED_AT }
      ),
    ])

    const result = await importBackup(zip)

    expect(result.missingPhotoIds).toEqual([photoId])
    expect(result.counts.photos).toBe(0)
    // The person is still restored — just without the photo reference.
    expect(await db.people.get(person.id)).toMatchObject({ id: person.id })
    expect((await db.people.get(person.id))?.photoId).toBeUndefined()
  })

  // Losing one photo out of three must not cost the other two — the repair
  // drops only what is actually missing.
  it("keeps the photos that survived when only some of a gallery is missing", async () => {
    const kept = crypto.randomUUID()
    const gone = crypto.randomUUID()
    const person = makePerson({ photoIds: [gone, kept], photoId: gone })
    const manifest = {
      schema: 2,
      people: [person],
      relationships: [],
      trees: [],
      members: [],
      photos: [
        { id: gone, mime: "image/jpeg", file: "photos/gone.jpg" },
        { id: kept, mime: "image/jpeg", file: "photos/kept.jpg" },
      ],
    }
    const { zipSync, strToU8 } = await import("fflate")
    const zip = new Blob([
      zipSync(
        {
          "backup.json": strToU8(JSON.stringify(manifest)),
          "photos/kept.jpg": PHOTO_BYTES,
        },
        { mtime: EXPORTED_AT }
      ),
    ])

    const result = await importBackup(zip)

    expect(result.missingPhotoIds).toEqual([gone])
    const restored = await db.people.get(person.id)
    expect(restored?.photoIds).toEqual([kept])
    // The mirror is repaired too: it pointed at the photo that vanished.
    expect(restored?.photoId).toBe(kept)
  })

  it("round-trips a document with its bytes, name and owner intact", async () => {
    const { root } = await seedFixture()
    const bytes = new Uint8Array([37, 80, 68, 70]) // "%PDF"
    await db.attachments.add({
      id: "att-1",
      personId: root.id,
      name: "Birth certificate.pdf",
      mime: "application/pdf",
      blob: new Blob([bytes], { type: "application/pdf" }),
      size: bytes.length,
      addedAt: 1234,
    })

    const blob = await exportBackup(EXPORTED_AT)
    await db.attachments.clear()
    const result = await importBackup(blob)

    expect(result.counts.attachments).toBe(1)
    expect(result.missingAttachmentIds).toEqual([])
    const restored = await db.attachments.get("att-1")
    expect(restored).toMatchObject({
      personId: root.id,
      name: "Birth certificate.pdf",
      mime: "application/pdf",
      size: 4,
      addedAt: 1234,
    })
    expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(bytes)
  })

  // Reported separately from a missing photo: one costs a face, the other
  // costs a record the family may no longer have a copy of.
  it("reports a document the archive didn't contain and restores the rest", async () => {
    const person = makePerson({ givenName: "Ada" })
    const manifest = {
      schema: 2,
      people: [person],
      relationships: [],
      trees: [],
      members: [],
      photos: [],
      attachments: [
        {
          id: "gone",
          personId: person.id,
          name: "will.pdf",
          mime: "application/pdf",
          size: 10,
          addedAt: 1,
          file: "attachments/gone.pdf",
        },
      ],
    }
    const { zipSync, strToU8 } = await import("fflate")
    const zip = new Blob([
      zipSync(
        { "backup.json": strToU8(JSON.stringify(manifest)) },
        { mtime: EXPORTED_AT }
      ),
    ])

    const result = await importBackup(zip)

    expect(result.missingAttachmentIds).toEqual(["gone"])
    expect(await db.people.get(person.id)).toBeTruthy()
    expect(await db.attachments.count()).toBe(0)
  })

  // A document in nobody's drawer is unreachable in the UI and countable only
  // as unattributed bytes.
  it("drops a document whose owner the backup doesn't contain", async () => {
    const manifest = {
      schema: 2,
      people: [],
      relationships: [],
      trees: [],
      members: [],
      photos: [],
      attachments: [
        {
          id: "orphan",
          personId: "nobody",
          name: "will.pdf",
          mime: "application/pdf",
          size: 4,
          addedAt: 1,
          file: "attachments/orphan.pdf",
        },
      ],
    }
    const { zipSync, strToU8 } = await import("fflate")
    const zip = new Blob([
      zipSync(
        {
          "backup.json": strToU8(JSON.stringify(manifest)),
          "attachments/orphan.pdf": new Uint8Array([1, 2, 3, 4]),
        },
        { mtime: EXPORTED_AT }
      ),
    ])

    await importBackup(zip)

    expect(await db.attachments.count()).toBe(0)
  })

  // A backup written before documents existed carries no `attachments` key at
  // all. The default keeps it valid rather than making every old file fail.
  it("accepts a schema-2 backup with no attachments key", async () => {
    const manifest = {
      schema: 2,
      people: [makePerson({ givenName: "Ada" })],
      relationships: [],
      trees: [],
      members: [],
      photos: [],
    }
    const { zipSync, strToU8 } = await import("fflate")
    const zip = new Blob([
      zipSync(
        { "backup.json": strToU8(JSON.stringify(manifest)) },
        { mtime: EXPORTED_AT }
      ),
    ])

    const result = await importBackup(zip)

    expect(result.counts.attachments).toBe(0)
    expect(result.counts.people).toBe(1)
  })

  it("replaces existing data rather than merging it", async () => {
    await seedFixture()
    const blob = await exportBackup(EXPORTED_AT)

    const strayId = await db.people.add(makePerson({ givenName: "Stray" }))

    await importBackup(blob)

    expect(await db.people.get(strayId)).toBeUndefined()
    expect(await db.people.count()).toBe(2)
  })

  // Backups already in users' hands are schema-1 .json files. These are the
  // regression suite for that path — it has to keep working forever.
  describe("legacy schema-1 .json backups", () => {
    it("decodes base64 photo data back into a stored Photo row", async () => {
      const photoId = crypto.randomUUID()
      const envelope = legacyEnvelope({
        photos: [
          { id: photoId, mime: "image/jpeg", data: btoa("fake-image-bytes") },
        ],
      })

      const result = await importBackup(new Blob([envelope]))

      expect(result.schema).toBe(1)
      const stored = await db.photos.get(photoId)
      expect(stored?.mime).toBe("image/jpeg")
      expect(await stored!.blob.text()).toBe("fake-image-bytes")
    })

    it("rejects invalid JSON without touching existing data", async () => {
      const { root } = await seedFixture()

      await expect(importBackup(new Blob(["not json"]))).rejects.toThrow(
        InvalidBackupError
      )
      expect(await db.people.get(root.id)).toBeDefined()
    })

    it("rejects an unknown schema version without touching existing data", async () => {
      const { root } = await seedFixture()

      await expect(
        importBackup(new Blob([legacyEnvelope({ schema: 99 })]))
      ).rejects.toThrow(/Unsupported backup version/)
      expect(await db.people.get(root.id)).toBeDefined()
    })

    it("rejects a structurally invalid envelope without touching existing data", async () => {
      const { root } = await seedFixture()

      const badEnvelope = legacyEnvelope({
        people: [{ id: "x" }], // missing givenName/createdAt/updatedAt
      })

      await expect(importBackup(new Blob([badEnvelope]))).rejects.toThrow(
        InvalidBackupError
      )
      expect(await db.people.get(root.id)).toBeDefined()
    })

    it("points the user at the .zip when they pick an extracted backup.json", async () => {
      const { root } = await seedFixture()

      const manifest = JSON.stringify({
        schema: 2,
        people: [],
        relationships: [],
        trees: [],
        members: [],
        photos: [],
      })

      await expect(importBackup(new Blob([manifest]))).rejects.toThrow(
        /choose the \.zip file itself/
      )
      expect(await db.people.get(root.id)).toBeDefined()
    })
  })
})

describe("health dismissals in a backup", () => {
  it("survives an export and restore", async () => {
    // They are the reader's own judgements about their own data. A restore
    // that told them again about the three things they already decided were
    // fine would be a restore that lost something.
    const person = makePerson({ givenName: "Suniti" })
    await db.people.add(person)
    await db.dismissals.add({
      key: `missing-birth-year:${person.id}`,
      kind: "finding",
      personIds: [person.id],
      dismissedAt: EXPORTED_AT.getTime(),
    })

    const blob = await exportBackup(EXPORTED_AT)
    await db.dismissals.clear()
    await importBackup(blob)

    const restored = await db.dismissals.toArray()
    expect(restored).toEqual([
      {
        key: `missing-birth-year:${person.id}`,
        kind: "finding",
        personIds: [person.id],
        dismissedAt: EXPORTED_AT.getTime(),
      },
    ])
  })

  it("drops one naming a person the backup does not contain", async () => {
    // It could never match a finding again, and would silence a real one if
    // that id were ever reissued.
    const person = makePerson()
    await db.people.add(person)
    await db.dismissals.add({
      key: "duplicate:ghost,other-ghost",
      kind: "duplicate",
      personIds: ["ghost", "other-ghost"],
      dismissedAt: EXPORTED_AT.getTime(),
    })

    const blob = await exportBackup(EXPORTED_AT)
    await importBackup(blob)

    expect(await db.dismissals.toArray()).toEqual([])
  })

  it("restores a backup written before dismissals existed", async () => {
    // The array is additive with a default, so an older schema-2 manifest
    // still validates rather than being rejected outright (D13).
    const person = makePerson()
    await db.people.add(person)
    const blob = await exportBackup(EXPORTED_AT)

    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const manifest = JSON.parse(
      new TextDecoder().decode(files["backup.json"])
    ) as Record<string, unknown>
    delete manifest.dismissals
    files["backup.json"] = new TextEncoder().encode(JSON.stringify(manifest))

    const { zipSync } = await import("fflate")
    const older = new Blob([zipSync(files) as unknown as BlobPart])

    await expect(importBackup(older)).resolves.toBeDefined()
    expect(await db.dismissals.toArray()).toEqual([])
  })
})
