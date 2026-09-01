import { db } from "~/lib/db/db"

const LAST_EXPORT_KEY = "lastExportDate"
// Bumped by the change signal rather than derived from the data, because the
// data can't answer the question: Relationship carries no timestamps, and a
// delete moves max(Person.updatedAt) *backwards* — so a tree that had its most
// recently edited person removed would look freshly backed up.
const LAST_CHANGE_KEY = "lastChangeDate"
const NUDGE_DISMISSED_KEY = "backupNudgeDismissedAt"

async function getMeta(key: string): Promise<string | undefined> {
  const row = await db.appMeta.get(key)
  return row?.value
}

async function setMeta(key: string, value: string): Promise<void> {
  await db.appMeta.put({ key, value })
}

export async function getLastExportDate(): Promise<string | undefined> {
  return getMeta(LAST_EXPORT_KEY)
}

export async function setLastExportDate(
  iso: string = new Date().toISOString()
): Promise<void> {
  await setMeta(LAST_EXPORT_KEY, iso)
}

export async function getLastChangeDate(): Promise<string | undefined> {
  return getMeta(LAST_CHANGE_KEY)
}

export async function setLastChangeDate(
  iso: string = new Date().toISOString()
): Promise<void> {
  await setMeta(LAST_CHANGE_KEY, iso)
}

export async function getBackupNudgeDismissedAt(): Promise<string | undefined> {
  return getMeta(NUDGE_DISMISSED_KEY)
}

export async function setBackupNudgeDismissedAt(
  iso: string = new Date().toISOString()
): Promise<void> {
  await setMeta(NUDGE_DISMISSED_KEY, iso)
}

// Called after a successful export. Without this a dismissal would go on
// suppressing a nudge that has already stopped being true, and the next one —
// thirty days later — would arrive a week late.
export async function clearBackupNudgeDismissal(): Promise<void> {
  await db.appMeta.delete(NUDGE_DISMISSED_KEY)
}
