import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  InvalidBackupError,
  exportBackup,
  importBackup,
} from "~/lib/export/json"
import type { Person, Relationship, Tree, TreeMember } from "~/lib/types"

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.relationships.clear(),
    db.trees.clear(),
    db.members.clear(),
    db.photos.clear(),
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

// No Photo in this fixture: fake-indexeddb doesn't implement structured-clone for Blob
// (it silently round-trips one as `{}`), so — same as app/lib/photos.test.ts — blob
// content is never asserted here, and exportBackup's blob-reading path (which needs a
// real Blob back from the table) isn't exercised through the DB at all in tests.
async function seedFixture() {
  const root = makePerson({ givenName: "Root" })
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

  return { root, child, relationship, tree, member }
}

describe("exportBackup", () => {
  it("produces a schema-1 envelope covering every table", async () => {
    await seedFixture()

    const blob = await exportBackup()
    expect(blob.type).toBe("application/json")

    const envelope = JSON.parse(await blob.text())
    expect(envelope.schema).toBe(1)
    expect(envelope.people).toHaveLength(2)
    expect(envelope.relationships).toHaveLength(1)
    expect(envelope.trees).toHaveLength(1)
    expect(envelope.members).toHaveLength(1)
    expect(envelope.photos).toEqual([])
  })
})

describe("importBackup", () => {
  it("round-trips: export then import restores every table exactly", async () => {
    const { root, child, relationship, tree, member } = await seedFixture()

    const blob = await exportBackup()
    await importBackup(blob)

    expect(await db.people.get(root.id)).toEqual(root)
    expect(await db.people.get(child.id)).toEqual(child)
    expect(await db.relationships.get(relationship.id)).toEqual(relationship)
    expect(await db.trees.get(tree.id)).toEqual(tree)
    expect(await db.members.get([member.treeId, member.personId])).toEqual(
      member
    )
  })

  it("decodes a backup photo's base64 data back into a stored Photo row", async () => {
    const photoId = crypto.randomUUID()
    const envelope = JSON.stringify({
      schema: 1,
      people: [],
      relationships: [],
      trees: [],
      members: [],
      photos: [
        { id: photoId, mime: "image/jpeg", data: btoa("fake-image-bytes") },
      ],
    })

    await importBackup(new Blob([envelope]))

    expect(await db.photos.get(photoId)).toMatchObject({
      id: photoId,
      mime: "image/jpeg",
    })
  })

  it("replaces existing data rather than merging it", async () => {
    await seedFixture()
    const blob = await exportBackup()

    const strayId = await db.people.add(makePerson({ givenName: "Stray" }))

    await importBackup(blob)

    expect(await db.people.get(strayId)).toBeUndefined()
    expect(await db.people.count()).toBe(2)
  })

  it("rejects invalid JSON without touching existing data", async () => {
    const { root } = await seedFixture()

    await expect(importBackup(new Blob(["not json"]))).rejects.toThrow(
      InvalidBackupError
    )
    expect(await db.people.get(root.id)).toBeDefined()
  })

  it("rejects a mismatched schema version without touching existing data", async () => {
    const { root } = await seedFixture()

    const badEnvelope = JSON.stringify({
      schema: 2,
      people: [],
      relationships: [],
      trees: [],
      members: [],
      photos: [],
    })

    await expect(importBackup(new Blob([badEnvelope]))).rejects.toThrow(
      InvalidBackupError
    )
    expect(await db.people.get(root.id)).toBeDefined()
  })

  it("rejects a structurally invalid envelope without touching existing data", async () => {
    const { root } = await seedFixture()

    const badEnvelope = JSON.stringify({
      schema: 1,
      people: [{ id: "x" }], // missing givenName/createdAt/updatedAt
      relationships: [],
      trees: [],
      members: [],
      photos: [],
    })

    await expect(importBackup(new Blob([badEnvelope]))).rejects.toThrow(
      InvalidBackupError
    )
    expect(await db.people.get(root.id)).toBeDefined()
  })
})
