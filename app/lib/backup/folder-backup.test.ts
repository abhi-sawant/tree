import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  BackupDirectoryHandle,
  HandlePermission,
} from "~/lib/backup/file-system-access"
import {
  FOLDER_TARGET_ID,
  FolderPickerUnavailableError,
  MIN_FOLDER_WRITE_INTERVAL_MS,
  chooseBackupFolder,
  forgetBackupFolder,
  getFolderStatus,
  getFolderTarget,
  reconnectBackupFolder,
  shouldWriteFolderBackup,
  writeFolderBackup,
} from "~/lib/backup/folder-backup"
import { getLastExportDate } from "~/lib/db/app-meta"
import { db } from "~/lib/db/db"
import { createPerson } from "~/lib/db/people"

// Set by vitest.setup.ts. Read off the global rather than duplicated as a
// literal so the marker can't silently drift out of step with the shim.
const OPAQUE_CLONE = (globalThis as Record<string, unknown>)
  .OPAQUE_CLONE as string

// A stand-in for the Chromium directory handle. It records what was written so
// a test can assert on the bytes without a real filesystem, and lets each test
// set the permission the browser would report.
//
// Tagged OPAQUE_CLONE because it goes into IndexedDB: a real handle is
// structured-clonable and a mock made of functions is not.
function fakeDirectory(
  options: { permission?: HandlePermission; name?: string } = {}
) {
  const written = new Map<string, Blob>()
  const state = { permission: options.permission ?? "granted" }
  let failNextWrite: Error | undefined

  const handle = {
    [OPAQUE_CLONE]: true,
    kind: "directory" as const,
    name: options.name ?? "Backups",
    queryPermission: vi.fn(async () => state.permission),
    requestPermission: vi.fn(async () => {
      state.permission = "granted"
      return state.permission
    }),
    getFileHandle: vi.fn(async (filename: string) => ({
      name: filename,
      createWritable: async () => {
        const chunks: Blob[] = []
        return {
          write: async (data: Blob) => {
            if (failNextWrite) throw failNextWrite
            chunks.push(data)
          },
          close: async () => {
            written.set(filename, new Blob(chunks))
          },
        }
      },
    })),
  }

  return {
    handle: handle as unknown as BackupDirectoryHandle,
    written,
    state,
    failWith: (error: Error) => {
      failNextWrite = error
    },
  }
}

async function storeTarget(
  handle: BackupDirectoryHandle,
  extra: Partial<{ lastWriteAt: number; lastError: string }> = {}
) {
  await db.backupTargets.put({
    id: FOLDER_TARGET_ID,
    handle,
    name: handle.name,
    chosenAt: 0,
    ...extra,
  })
}

const originalPicker = (window as unknown as Record<string, unknown>)
  .showDirectoryPicker

function setPicker(picker: unknown) {
  if (picker === undefined) {
    delete (window as unknown as Record<string, unknown>).showDirectoryPicker
    return
  }
  ;(window as unknown as Record<string, unknown>).showDirectoryPicker = picker
}

beforeEach(() => {
  // Every test but the unsupported-browser ones needs the API to look present.
  setPicker(vi.fn())
})

afterEach(async () => {
  setPicker(originalPicker)
  await Promise.all([
    db.backupTargets.clear(),
    db.people.clear(),
    db.relationships.clear(),
    db.trees.clear(),
    db.members.clear(),
    db.photos.clear(),
    db.appMeta.clear(),
    db.snapshots.clear(),
  ])
})

// zip mtimes can't predate 1980, so writeFolderBackup needs a plausible date.
const NOW = new Date("2026-09-01T10:00:00.000Z")
const at = (msAfter: number) => new Date(NOW.getTime() + msAfter)

describe("shouldWriteFolderBackup", () => {
  it("refuses unless permission is granted right now", () => {
    for (const status of ["none", "prompt", "denied", "unsupported"] as const) {
      expect(shouldWriteFolderBackup({ status, now: 1_000_000 })).toBe(false)
    }
  })

  it("always writes the first backup to a newly chosen folder", () => {
    expect(shouldWriteFolderBackup({ status: "granted", now: 0 })).toBe(true)
  })

  it("holds off inside the minimum interval", () => {
    expect(
      shouldWriteFolderBackup({
        status: "granted",
        lastWriteAt: 0,
        now: MIN_FOLDER_WRITE_INTERVAL_MS - 1,
      })
    ).toBe(false)
  })

  it("writes once the interval has elapsed", () => {
    expect(
      shouldWriteFolderBackup({
        status: "granted",
        lastWriteAt: 0,
        now: MIN_FOLDER_WRITE_INTERVAL_MS,
      })
    ).toBe(true)
  })

  it("force overrides the interval but never a missing permission", () => {
    expect(
      shouldWriteFolderBackup({
        status: "granted",
        lastWriteAt: 0,
        now: 1,
        force: true,
      })
    ).toBe(true)
    expect(
      shouldWriteFolderBackup({
        status: "prompt",
        lastWriteAt: 0,
        now: 1,
        force: true,
      })
    ).toBe(false)
  })

  it("writes rather than stalls when the clock has moved backwards", () => {
    expect(
      shouldWriteFolderBackup({ status: "granted", lastWriteAt: 5000, now: 10 })
    ).toBe(true)
  })
})

describe("getFolderStatus", () => {
  it("reports unsupported when the browser has no picker", async () => {
    setPicker(undefined)
    expect(await getFolderStatus()).toBe("unsupported")
  })

  it("reports none before a folder is chosen", async () => {
    expect(await getFolderStatus()).toBe("none")
  })

  it("passes the handle's own permission through", async () => {
    const directory = fakeDirectory({ permission: "prompt" })
    await storeTarget(directory.handle)

    expect(await getFolderStatus()).toBe("prompt")
    expect(directory.handle.queryPermission).toHaveBeenCalledWith({
      mode: "readwrite",
    })
  })

  it("treats a handle that throws as needing reconnection", async () => {
    const directory = fakeDirectory()
    vi.mocked(directory.handle.queryPermission).mockRejectedValue(
      new Error("NotFoundError")
    )
    await storeTarget(directory.handle)

    expect(await getFolderStatus()).toBe("prompt")
  })
})

describe("the directory-handle test double", () => {
  // If the OPAQUE_CLONE contract with vitest.setup.ts ever breaks, every other
  // test here fails with an opaque DataCloneError. This one says why.
  it("survives the round trip through IndexedDB", async () => {
    const directory = fakeDirectory({ name: "Backups" })
    await storeTarget(directory.handle)

    const stored = await db.backupTargets.get(FOLDER_TARGET_ID)

    expect(stored?.handle).toBe(directory.handle)
    expect(await stored?.handle.queryPermission()).toBe("granted")
  })
})

describe("getFolderTarget", () => {
  it("returns nothing on a browser without the API, even with a row stored", async () => {
    await storeTarget(fakeDirectory().handle)
    setPicker(undefined)

    expect(await getFolderTarget()).toBeUndefined()
  })

  it("returns the stored target", async () => {
    await storeTarget(fakeDirectory({ name: "Family" }).handle)

    expect((await getFolderTarget())?.name).toBe("Family")
  })
})

describe("chooseBackupFolder", () => {
  it("stores the handle and caches its name", async () => {
    const directory = fakeDirectory({ name: "Dropbox" })
    setPicker(vi.fn().mockResolvedValue(directory.handle))

    const target = await chooseBackupFolder(NOW)

    expect(target).toMatchObject({
      id: FOLDER_TARGET_ID,
      name: "Dropbox",
      chosenAt: NOW.getTime(),
    })
    expect((await db.backupTargets.get(FOLDER_TARGET_ID))?.name).toBe("Dropbox")
  })

  it("asks for readwrite, not read", async () => {
    const picker = vi.fn().mockResolvedValue(fakeDirectory().handle)
    setPicker(picker)

    await chooseBackupFolder(NOW)

    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "readwrite" })
    )
  })

  it("replaces a previous choice rather than accumulating rows", async () => {
    setPicker(
      vi.fn().mockResolvedValue(fakeDirectory({ name: "First" }).handle)
    )
    await chooseBackupFolder(NOW)
    setPicker(
      vi.fn().mockResolvedValue(fakeDirectory({ name: "Second" }).handle)
    )
    await chooseBackupFolder(NOW)

    expect(await db.backupTargets.count()).toBe(1)
    expect((await db.backupTargets.get(FOLDER_TARGET_ID))?.name).toBe("Second")
  })

  it("refuses on a browser without the picker", async () => {
    setPicker(undefined)

    await expect(chooseBackupFolder(NOW)).rejects.toThrow(
      FolderPickerUnavailableError
    )
  })
})

describe("reconnectBackupFolder", () => {
  it("requests permission on the stored handle", async () => {
    const directory = fakeDirectory({ permission: "prompt" })
    await storeTarget(directory.handle)

    expect(await reconnectBackupFolder()).toBe("granted")
    expect(directory.handle.requestPermission).toHaveBeenCalledWith({
      mode: "readwrite",
    })
  })

  it("reports none with no folder chosen", async () => {
    expect(await reconnectBackupFolder()).toBe("none")
  })

  it("reports prompt when the request throws", async () => {
    const directory = fakeDirectory()
    vi.mocked(directory.handle.requestPermission).mockRejectedValue(
      new Error("no gesture")
    )
    await storeTarget(directory.handle)

    expect(await reconnectBackupFolder()).toBe("prompt")
  })
})

describe("forgetBackupFolder", () => {
  it("drops the stored handle", async () => {
    await storeTarget(fakeDirectory().handle)

    await forgetBackupFolder()

    expect(await db.backupTargets.count()).toBe(0)
  })
})

describe("writeFolderBackup", () => {
  it("writes a dated archive and records the write", async () => {
    await createPerson({ givenName: "Ada" })
    const directory = fakeDirectory()
    await storeTarget(directory.handle)

    const outcome = await writeFolderBackup({ now: NOW })

    expect(outcome).toMatchObject({
      written: true,
      filename: "family-tree-backup-2026-09-01.zip",
    })
    expect(directory.written.has("family-tree-backup-2026-09-01.zip")).toBe(
      true
    )
    const target = await db.backupTargets.get(FOLDER_TARGET_ID)
    expect(target?.lastWriteAt).toBe(NOW.getTime())
    expect(target?.lastWriteBytes).toBeGreaterThan(0)
  })

  it("creates the file rather than requiring it to exist", async () => {
    await createPerson({ givenName: "Ada" })
    const directory = fakeDirectory()
    await storeTarget(directory.handle)

    await writeFolderBackup({ now: NOW })

    expect(directory.handle.getFileHandle).toHaveBeenCalledWith(
      "family-tree-backup-2026-09-01.zip",
      { create: true }
    )
  })

  it("counts as an export, so the staleness signal doesn't contradict it", async () => {
    await createPerson({ givenName: "Ada" })
    await storeTarget(fakeDirectory().handle)

    await writeFolderBackup({ now: NOW })

    expect(await getLastExportDate()).toBe(NOW.toISOString())
  })

  it("overwrites the same file for a second write on the same day", async () => {
    await createPerson({ givenName: "Ada" })
    const directory = fakeDirectory()
    await storeTarget(directory.handle)

    await writeFolderBackup({ now: NOW })
    await createPerson({ givenName: "Grace" })
    await writeFolderBackup({ now: at(MIN_FOLDER_WRITE_INTERVAL_MS) })

    expect([...directory.written.keys()]).toEqual([
      "family-tree-backup-2026-09-01.zip",
    ])
  })

  it("starts a new file on a new day, leaving yesterday's alone", async () => {
    await createPerson({ givenName: "Ada" })
    const directory = fakeDirectory()
    await storeTarget(directory.handle)

    await writeFolderBackup({ now: NOW })
    await writeFolderBackup({ now: at(24 * 60 * 60 * 1000) })

    expect([...directory.written.keys()].sort()).toEqual([
      "family-tree-backup-2026-09-01.zip",
      "family-tree-backup-2026-09-02.zip",
    ])
  })

  it("holds off inside the minimum interval", async () => {
    await createPerson({ givenName: "Ada" })
    const directory = fakeDirectory()
    await storeTarget(directory.handle)
    await writeFolderBackup({ now: NOW })

    const outcome = await writeFolderBackup({ now: at(1000) })

    expect(outcome).toEqual({ written: false, reason: "too-soon" })
  })

  it("writes inside the interval when forced", async () => {
    await createPerson({ givenName: "Ada" })
    await storeTarget(fakeDirectory().handle)
    await writeFolderBackup({ now: NOW })

    const outcome = await writeFolderBackup({ now: at(1000), force: true })

    expect(outcome).toMatchObject({ written: true })
  })

  it("refuses without permission, without touching the folder", async () => {
    await createPerson({ givenName: "Ada" })
    const directory = fakeDirectory({ permission: "prompt" })
    await storeTarget(directory.handle)

    expect(await writeFolderBackup({ now: NOW })).toEqual({
      written: false,
      reason: "prompt",
    })
    expect(directory.handle.getFileHandle).not.toHaveBeenCalled()
  })

  it("reports none when no folder has been chosen", async () => {
    expect(await writeFolderBackup({ now: NOW })).toEqual({
      written: false,
      reason: "none",
    })
  })

  it("records a failure instead of failing silently", async () => {
    await createPerson({ givenName: "Ada" })
    const directory = fakeDirectory()
    directory.failWith(new Error("The device was ejected."))
    await storeTarget(directory.handle)

    const outcome = await writeFolderBackup({ now: NOW })

    expect(outcome).toMatchObject({ written: false, reason: "error" })
    const target = await db.backupTargets.get(FOLDER_TARGET_ID)
    expect(target?.lastError).toBe("The device was ejected.")
    // A failed write must not look like a successful export.
    expect(target?.lastWriteAt).toBeUndefined()
    expect(await getLastExportDate()).toBeUndefined()
  })

  it("clears a recorded failure once a write succeeds", async () => {
    await createPerson({ givenName: "Ada" })
    const directory = fakeDirectory()
    await storeTarget(directory.handle, {
      lastError: "The device was ejected.",
    })

    await writeFolderBackup({ now: NOW })

    expect(
      (await db.backupTargets.get(FOLDER_TARGET_ID))?.lastError
    ).toBeUndefined()
  })
})
