import { afterEach, describe, expect, it } from "vitest"

import {
  MAX_SNAPSHOTS,
  MIN_AUTO_INTERVAL_MS,
  SnapshotNotFoundError,
  createAutoSnapshot,
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  pruneSnapshots,
  restoreSnapshot,
  snapshotsToPrune,
} from "~/lib/backup/snapshots"
import { db } from "~/lib/db/db"
import { addRelationship } from "~/lib/db/relationships"
import { createPerson } from "~/lib/db/people"
import { createTree } from "~/lib/db/trees"

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.relationships.clear(),
    db.trees.clear(),
    db.members.clear(),
    db.photos.clear(),
    db.snapshots.clear(),
  ])
})

// zip mtimes can't represent anything before 1980, so every date used here has
// to be a plausible one — see the note on zipEntries in export/archive.ts.
const T0 = new Date("2026-06-01T12:00:00.000Z")
const at = (msAfter: number) => new Date(T0.getTime() + msAfter)

describe("snapshotsToPrune", () => {
  const rows = (times: number[]) =>
    times.map((createdAt, i) => ({ id: `s${i}`, createdAt }))

  it("keeps nothing to prune below the limit", () => {
    expect(snapshotsToPrune(rows([1, 2, 3]), 10)).toEqual([])
  })

  it("drops the oldest beyond the limit", () => {
    expect(snapshotsToPrune(rows([1, 2, 3, 4, 5]), 3)).toEqual(["s0", "s1"])
  })

  it("returns the doomed ids oldest first", () => {
    expect(snapshotsToPrune(rows([5, 1, 3, 2, 4]), 2)).toEqual([
      "s1",
      "s3",
      "s2",
    ])
  })

  it("ignores the order it was handed", () => {
    const ascending = snapshotsToPrune(rows([1, 2, 3, 4]), 2)
    const descending = snapshotsToPrune([...rows([1, 2, 3, 4])].reverse(), 2)
    expect(ascending).toEqual(descending)
  })

  it("breaks a same-millisecond tie deterministically", () => {
    const forward = snapshotsToPrune(
      [
        { id: "a", createdAt: 100 },
        { id: "b", createdAt: 100 },
      ],
      1
    )
    const reversed = snapshotsToPrune(
      [
        { id: "b", createdAt: 100 },
        { id: "a", createdAt: 100 },
      ],
      1
    )
    expect(forward).toEqual(["a"])
    expect(reversed).toEqual(["a"])
  })

  it("prunes everything when asked to keep none", () => {
    expect(snapshotsToPrune(rows([1, 2]), 0)).toEqual(["s0", "s1"])
  })

  it("handles an empty list", () => {
    expect(snapshotsToPrune([], 10)).toEqual([])
  })
})

describe("createSnapshot", () => {
  it("records what the snapshot holds without needing the archive opened", async () => {
    const parent = await createPerson({ givenName: "Ada" })
    const child = await createPerson({ givenName: "Grace" })
    await addRelationship({
      type: "parent-child",
      from: parent.id,
      to: child.id,
    })
    await createTree({ name: "Byrons", rootPersonId: parent.id })

    const summary = await createSnapshot("manual", { now: T0 })

    expect(summary).toMatchObject({
      reason: "manual",
      createdAt: T0.getTime(),
      counts: { people: 2, relationships: 1, trees: 1, members: 1 },
    })
    expect(summary.size).toBeGreaterThan(0)
  })

  it("excludes photos, so the archive doesn't grow with the photo library", async () => {
    const person = await createPerson({ givenName: "Ada" })
    await db.photos.add({
      id: "photo-1",
      mime: "image/jpeg",
      blob: new Blob(["x".repeat(50_000)]),
    })
    await db.people.update(person.id, { photoId: "photo-1" })

    const summary = await createSnapshot("manual", { now: T0 })

    expect(summary.size).toBeLessThan(5_000)
  })

  it("prunes down to the retention limit as it goes", async () => {
    await createPerson({ givenName: "Ada" })
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) {
      await createSnapshot("manual", { now: at(i * 1000) })
    }

    expect(await db.snapshots.count()).toBe(MAX_SNAPSHOTS)
    const remaining = await listSnapshots()
    // The three oldest went; the newest is still the newest.
    expect(remaining[0].createdAt).toBe(
      at((MAX_SNAPSHOTS + 2) * 1000).getTime()
    )
  })
})

describe("listSnapshots", () => {
  it("returns newest first and omits the blob", async () => {
    await createPerson({ givenName: "Ada" })
    await createSnapshot("manual", { now: at(0) })
    await createSnapshot("auto", { now: at(60_000) })

    const list = await listSnapshots()

    expect(list.map((s) => s.reason)).toEqual(["auto", "manual"])
    expect(list[0]).not.toHaveProperty("blob")
  })

  it("is empty before anything is snapshotted", async () => {
    expect(await listSnapshots()).toEqual([])
  })
})

describe("createAutoSnapshot", () => {
  it("declines to snapshot an empty pool", async () => {
    expect(await createAutoSnapshot({ now: T0 })).toBeUndefined()
    expect(await db.snapshots.count()).toBe(0)
  })

  it("takes the first one as soon as there is anything to lose", async () => {
    await createPerson({ givenName: "Ada" })

    const summary = await createAutoSnapshot({ now: T0 })

    expect(summary?.reason).toBe("auto")
  })

  it("skips one that would land inside the minimum interval", async () => {
    await createPerson({ givenName: "Ada" })
    await createAutoSnapshot({ now: T0 })

    const second = await createAutoSnapshot({
      now: at(MIN_AUTO_INTERVAL_MS - 1),
    })

    expect(second).toBeUndefined()
    expect(await db.snapshots.count()).toBe(1)
  })

  it("takes one once the interval has elapsed", async () => {
    await createPerson({ givenName: "Ada" })
    await createAutoSnapshot({ now: T0 })

    const second = await createAutoSnapshot({ now: at(MIN_AUTO_INTERVAL_MS) })

    expect(second).toBeDefined()
    expect(await db.snapshots.count()).toBe(2)
  })

  it("measures the interval from the newest snapshot, whatever took it", async () => {
    await createPerson({ givenName: "Ada" })
    await createSnapshot("manual", { now: T0 })

    expect(await createAutoSnapshot({ now: at(1000) })).toBeUndefined()
  })
})

describe("restoreSnapshot", () => {
  it("brings back people and relationships that were deleted after it", async () => {
    const ada = await createPerson({ givenName: "Ada" })
    const grace = await createPerson({ givenName: "Grace" })
    await addRelationship({ type: "spouse", from: ada.id, to: grace.id })

    const snapshot = await createSnapshot("manual", { now: T0 })

    await db.relationships.clear()
    await db.people.delete(grace.id)
    expect(await db.people.count()).toBe(1)

    const result = await restoreSnapshot(snapshot.id, { now: at(60_000) })

    expect(result.counts.people).toBe(2)
    expect(await db.people.count()).toBe(2)
    expect(await db.relationships.count()).toBe(1)
    expect((await db.people.get(grace.id))?.givenName).toBe("Grace")
  })

  it("discards people added after the snapshot", async () => {
    await createPerson({ givenName: "Ada" })
    const snapshot = await createSnapshot("manual", { now: T0 })
    const mistake = await createPerson({ givenName: "Typo" })

    await restoreSnapshot(snapshot.id, { now: at(60_000) })

    expect(await db.people.get(mistake.id)).toBeUndefined()
    expect(await db.people.count()).toBe(1)
  })

  it("takes a pre-restore snapshot so the restore is itself undoable", async () => {
    await createPerson({ givenName: "Ada" })
    const first = await createSnapshot("manual", { now: T0 })
    const regrettable = await createPerson({ givenName: "Grace" })

    await restoreSnapshot(first.id, { now: at(60_000) })

    const list = await listSnapshots()
    expect(list[0].reason).toBe("pre-restore")
    expect(list[0].counts.people).toBe(2)

    // And going back to it returns the person the restore removed.
    await restoreSnapshot(list[0].id, { now: at(120_000) })
    expect(await db.people.get(regrettable.id)).toBeDefined()
  })

  it("leaves the photo library alone and clears references it can't honour", async () => {
    const ada = await createPerson({ givenName: "Ada" })
    await db.photos.add({
      id: "gone",
      mime: "image/jpeg",
      blob: new Blob(["a"]),
    })
    await db.photos.add({
      id: "kept",
      mime: "image/jpeg",
      blob: new Blob(["b"]),
    })
    await db.people.update(ada.id, { photoId: "gone" })
    const snapshot = await createSnapshot("manual", { now: T0 })

    // Simulates the photo being deleted along with the person, then the person
    // being brought back by the restore.
    await db.photos.delete("gone")

    const result = await restoreSnapshot(snapshot.id, { now: at(60_000) })

    expect(result.clearedPhotoIds).toEqual(["gone"])
    expect((await db.people.get(ada.id))?.photoId).toBeUndefined()
    // The unrelated photo was never in the snapshot and must survive it.
    expect(await db.photos.get("kept")).toBeDefined()
  })

  it("keeps a photo reference the browser still holds", async () => {
    const ada = await createPerson({ givenName: "Ada" })
    await db.photos.add({
      id: "kept",
      mime: "image/jpeg",
      blob: new Blob(["b"]),
    })
    await db.people.update(ada.id, { photoId: "kept" })
    const snapshot = await createSnapshot("manual", { now: T0 })
    await db.people.update(ada.id, { photoId: undefined })

    const result = await restoreSnapshot(snapshot.id, { now: at(60_000) })

    expect(result.clearedPhotoIds).toEqual([])
    expect((await db.people.get(ada.id))?.photoId).toBe("kept")
  })

  it("refuses an id that doesn't exist without disturbing anything", async () => {
    await createPerson({ givenName: "Ada" })

    await expect(restoreSnapshot("nope")).rejects.toThrow(SnapshotNotFoundError)
    expect(await db.snapshots.count()).toBe(0)
    expect(await db.people.count()).toBe(1)
  })
})

describe("pruneSnapshots / deleteSnapshot", () => {
  it("deletes one by id", async () => {
    await createPerson({ givenName: "Ada" })
    const snapshot = await createSnapshot("manual", { now: T0 })

    await deleteSnapshot(snapshot.id)

    expect(await db.snapshots.count()).toBe(0)
  })

  it("reports which ids it pruned", async () => {
    await createPerson({ givenName: "Ada" })
    const oldest = await createSnapshot("manual", { now: at(0) })
    await createSnapshot("manual", { now: at(1000) })

    expect(await pruneSnapshots(1)).toEqual([oldest.id])
    expect(await db.snapshots.count()).toBe(1)
  })
})
