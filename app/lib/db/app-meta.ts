import { db } from "~/lib/db/db"

const LAST_EXPORT_KEY = "lastExportDate"

export async function getLastExportDate(): Promise<string | undefined> {
  const row = await db.appMeta.get(LAST_EXPORT_KEY)
  return row?.value
}

export async function setLastExportDate(
  iso: string = new Date().toISOString()
): Promise<void> {
  await db.appMeta.put({ key: LAST_EXPORT_KEY, value: iso })
}
