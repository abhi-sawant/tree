import {
  directoryPicker,
  isFolderBackupSupported,
  type BackupDirectoryHandle,
} from "~/lib/backup/file-system-access"
import { db } from "~/lib/db/db"
import { setLastExportDate } from "~/lib/db/app-meta"
import { backupFilename } from "~/lib/export/filenames"
import { exportBackup } from "~/lib/export/json"
import type { BackupTarget } from "~/lib/types"

export { isFolderBackupSupported }

// One row, always this key.
export const FOLDER_TARGET_ID = "folder"

// Rewriting a multi-megabyte archive — every photo read into memory and
// deflated — is far too expensive to do per edit even after the scheduler's
// debounce. Five minutes bounds it during a long session while still meaning the
// worst case on a browser crash is five minutes of typing.
export const MIN_FOLDER_WRITE_INTERVAL_MS = 5 * 60 * 1000

export type FolderStatus =
  // The browser has no File System Access API at all.
  | "unsupported"
  // Supported, but no folder has been chosen.
  | "none"
  // Chosen and writable right now.
  | "granted"
  // Chosen, but the grant lapsed. Recoverable, and only by a user gesture.
  | "prompt"
  // Chosen, and the user has actively refused.
  | "denied"

export async function getFolderTarget(): Promise<BackupTarget | undefined> {
  if (!isFolderBackupSupported()) return undefined
  return db.backupTargets.get(FOLDER_TARGET_ID)
}

// Chromium keeps a handle usable across a reload only for a while, and a browser
// restart generally drops it back to "prompt". requestPermission then needs a
// user gesture, which is why this only ever *queries* — reconnecting is a button
// the user presses, not something the app can do on its own at load.
export async function getFolderStatus(): Promise<FolderStatus> {
  if (!isFolderBackupSupported()) return "unsupported"
  const target = await db.backupTargets.get(FOLDER_TARGET_ID)
  if (!target) return "none"
  try {
    return await target.handle.queryPermission({ mode: "readwrite" })
  } catch {
    // A handle whose backing directory is gone — an ejected drive, a deleted
    // folder — can throw here. Treated as needing reconnection, since that is
    // the action that would fix it.
    return "prompt"
  }
}

export class FolderPickerUnavailableError extends Error {
  constructor() {
    super("This browser can't choose a backup folder.")
    this.name = "FolderPickerUnavailableError"
  }
}

// Replaces any previous choice. The picker itself requires a user gesture, so
// this can only ever be called from a click.
export async function chooseBackupFolder(
  now: Date = new Date()
): Promise<BackupTarget> {
  const picker = directoryPicker()
  if (!picker) throw new FolderPickerUnavailableError()

  const handle = await picker({ mode: "readwrite", id: "familyTreeBackup" })

  const target: BackupTarget = {
    id: FOLDER_TARGET_ID,
    handle,
    name: handle.name,
    chosenAt: now.getTime(),
  }
  await db.backupTargets.put(target)
  return target
}

export async function forgetBackupFolder(): Promise<void> {
  await db.backupTargets.delete(FOLDER_TARGET_ID)
}

// Must be called from a user gesture or the browser refuses outright.
export async function reconnectBackupFolder(): Promise<FolderStatus> {
  const target = await db.backupTargets.get(FOLDER_TARGET_ID)
  if (!target) return isFolderBackupSupported() ? "none" : "unsupported"
  try {
    return await target.handle.requestPermission({ mode: "readwrite" })
  } catch {
    return "prompt"
  }
}

export interface ShouldWriteInput {
  status: FolderStatus
  lastWriteAt?: number
  now: number
  minIntervalMs?: number
  // Set when the page is being hidden or closed: the point of the interval is to
  // bound cost during a session, and this is the end of one.
  force?: boolean
}

export function shouldWriteFolderBackup(input: ShouldWriteInput): boolean {
  const {
    status,
    lastWriteAt,
    now,
    minIntervalMs = MIN_FOLDER_WRITE_INTERVAL_MS,
    force = false,
  } = input

  if (status !== "granted") return false
  if (lastWriteAt === undefined) return true
  if (force) return true
  // A lastWriteAt in the future means the clock moved backwards. Writing is the
  // safe reading of an ambiguous timestamp.
  if (lastWriteAt > now) return true
  return now - lastWriteAt >= minIntervalMs
}

export type FolderWriteOutcome =
  | { written: true; filename: string; bytes: number }
  | {
      written: false
      reason: FolderStatus | "too-soon" | "error"
      error?: string
    }

export interface WriteFolderBackupOptions {
  now?: Date
  force?: boolean
  minIntervalMs?: number
}

// One file per calendar day, overwritten through the day and never deleted.
//
// A single fixed filename would leave no history at all, and rotating with
// removeEntry would mean the app deleting files out of a folder the user owns —
// where a month-old backup is worth far more than a tidy directory. Per-day
// means the folder only grows on days the app was actually used, and the name
// matches the manual export's so the two sit together and sort together.
export async function writeFolderBackup(
  options: WriteFolderBackupOptions = {}
): Promise<FolderWriteOutcome> {
  const { now = new Date(), force = false, minIntervalMs } = options

  const target = await db.backupTargets.get(FOLDER_TARGET_ID)
  if (!target) {
    return {
      written: false,
      reason: isFolderBackupSupported() ? "none" : "unsupported",
    }
  }

  const status = await getFolderStatus()
  if (status !== "granted") return { written: false, reason: status }
  if (
    !shouldWriteFolderBackup({
      status,
      lastWriteAt: target.lastWriteAt,
      now: now.getTime(),
      minIntervalMs,
      force,
    })
  ) {
    return { written: false, reason: "too-soon" }
  }

  const filename = backupFilename(now)

  try {
    const blob = await exportBackup(now)
    const fileHandle = await target.handle.getFileHandle(filename, {
      create: true,
    })
    // createWritable writes to a swap file and renames on close, so a crash or
    // an ejected drive part-way through leaves yesterday's backup intact rather
    // than a truncated archive that looks like a backup and isn't.
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()

    await db.backupTargets.put({
      ...target,
      lastWriteAt: now.getTime(),
      lastWriteBytes: blob.size,
      lastError: undefined,
    })
    // The same envelope a manual export produces has now landed on disk, so
    // "last export" is genuinely satisfied and the staleness signal should not
    // claim otherwise.
    await setLastExportDate(now.toISOString())

    return { written: true, filename, bytes: blob.size }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Recorded rather than thrown away: a folder on an unplugged drive fails
    // every time, and a silent no-op would look exactly like a working backup.
    await db.backupTargets.put({ ...target, lastError: message })
    return { written: false, reason: "error", error: message }
  }
}
