import { db } from "~/lib/db/db"
import { buildBackupZip, parseBackupFile } from "~/lib/export/archive"
import { applyBackup } from "~/lib/export/json"
import type { Snapshot, SnapshotReason } from "~/lib/types"

// Ten, paired with MIN_AUTO_INTERVAL_MS below, covers at least a hundred
// minutes of work — the order of a two-hour data-entry session, the worst
// thing to lose. Keeping "the newest N" alone would not: auto
// snapshots firing every few seconds would leave all ten inside the last
// minute, with the state from before the damage already pruned away.
export const MAX_SNAPSHOTS = 10

// The floor between two automatic snapshots. Long enough that ten of them span
// a real session, short enough that no single mistake costs more than ten
// minutes of typing.
export const MIN_AUTO_INTERVAL_MS = 10 * 60 * 1000

export interface SnapshotSummary {
  id: string
  createdAt: number
  reason: SnapshotReason
  size: number
  counts: Snapshot["counts"]
}

function summarise(snapshot: Snapshot): SnapshotSummary {
  const { blob: _blob, ...summary } = snapshot
  return summary
}

// Newest first — the list is read as "how far back can I go", and the answer
// people want first is "to a minute ago".
export async function listSnapshots(): Promise<SnapshotSummary[]> {
  const snapshots = await db.snapshots.orderBy("createdAt").reverse().toArray()
  return snapshots.map(summarise)
}

// Pure, so the retention rule can be tested without writing ten archives.
// Returns the ids to drop, oldest first.
export function snapshotsToPrune(
  snapshots: Pick<Snapshot, "id" | "createdAt">[],
  keep: number = MAX_SNAPSHOTS
): string[] {
  if (keep <= 0) return snapshots.map((snapshot) => snapshot.id)
  // Tie-broken on id so two snapshots stamped the same millisecond prune
  // deterministically rather than depending on IndexedDB's key order.
  const byNewest = [...snapshots].sort(
    (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)
  )
  return byNewest
    .slice(keep)
    .map((snapshot) => snapshot.id)
    .reverse()
}

export interface CreateSnapshotOptions {
  now?: Date
  keep?: number
}

// A snapshot is the manual backup's own .zip envelope with the photos left out,
// so restoring one runs through the identical parse-and-apply path a file import
// does. Photos are excluded because they are nearly all of the bytes and nearly
// none of the risk: you either uploaded a photo or you didn't, whereas a
// mistaken merge or delete can wipe out an afternoon of names and dates. Ten
// copies of every photo would also multiply storage use by ten, in the one place
// IndexedDB eviction under storage pressure (ADR.md D25) is the actual danger.
export async function createSnapshot(
  reason: SnapshotReason,
  options: CreateSnapshotOptions = {}
): Promise<SnapshotSummary> {
  const { now = new Date(), keep = MAX_SNAPSHOTS } = options

  const [people, relationships, trees, members] = await Promise.all([
    db.people.toArray(),
    db.relationships.toArray(),
    db.trees.toArray(),
    db.members.toArray(),
  ])

  // Documents are left out for exactly the reason photos are, only more so:
  // they are stored at full size, so they are an even larger share of the bytes
  // and an even smaller share of the risk. A snapshot guards against a wrong
  // merge or a mistaken delete, not against a scan you never uploaded.
  const blob = await buildBackupZip(
    { people, relationships, trees, members, photos: [], attachments: [] },
    now
  )

  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    createdAt: now.getTime(),
    reason,
    blob,
    size: blob.size,
    counts: {
      people: people.length,
      relationships: relationships.length,
      trees: trees.length,
      members: members.length,
    },
  }

  await db.snapshots.add(snapshot)
  await pruneSnapshots(keep)

  return summarise(snapshot)
}

export async function pruneSnapshots(
  keep: number = MAX_SNAPSHOTS
): Promise<string[]> {
  const existing = await db.snapshots.orderBy("createdAt").toArray()
  const doomed = snapshotsToPrune(existing, keep)
  if (doomed.length > 0) await db.snapshots.bulkDelete(doomed)
  return doomed
}

export async function deleteSnapshot(id: string): Promise<void> {
  await db.snapshots.delete(id)
}

// Skips when the newest snapshot is too recent. Returns undefined rather than
// throwing, so the change-driven caller can fire on every edit and let this
// decide whether the edit was worth a snapshot.
export async function createAutoSnapshot(
  options: CreateSnapshotOptions & { minIntervalMs?: number } = {}
): Promise<SnapshotSummary | undefined> {
  const {
    now = new Date(),
    minIntervalMs = MIN_AUTO_INTERVAL_MS,
    ...rest
  } = options

  // An empty pool is not worth a snapshot: there is nothing to roll back to,
  // and the first person added would otherwise burn a retention slot on
  // restoring the app to empty.
  if ((await db.people.count()) === 0) return undefined

  const newest = await db.snapshots.orderBy("createdAt").last()
  if (newest && now.getTime() - newest.createdAt < minIntervalMs) {
    return undefined
  }

  return createSnapshot("auto", { now, ...rest })
}

export interface RestoreSnapshotResult {
  counts: Snapshot["counts"]
  // People whose photo is no longer in this browser — deleting a person deletes
  // their photo, so bringing them back cannot bring the image back with them.
  // The same is true of their documents, which the snapshot also never held.
  clearedPhotoIds: string[]
}

export class SnapshotNotFoundError extends Error {
  constructor(id: string) {
    super(`No snapshot with id ${id}`)
    this.name = "SnapshotNotFoundError"
  }
}

// Takes a pre-restore snapshot first, so rolling back to the wrong point is
// itself undoable. It is written before anything is touched, which also makes it
// the newest snapshot and therefore the last thing retention would prune.
export async function restoreSnapshot(
  id: string,
  options: CreateSnapshotOptions = {}
): Promise<RestoreSnapshotResult> {
  const snapshot = await db.snapshots.get(id)
  if (!snapshot) throw new SnapshotNotFoundError(id)

  // Parsed before the pre-restore snapshot is taken: a damaged archive should
  // fail without having disturbed anything, including retention.
  const parsed = await parseBackupFile(snapshot.blob)

  await createSnapshot("pre-restore", options)

  const { missingPhotoIds } = await applyBackup(parsed, {
    photos: "keep",
    attachments: "keep",
  })

  return { counts: snapshot.counts, clearedPhotoIds: missingPhotoIds }
}
