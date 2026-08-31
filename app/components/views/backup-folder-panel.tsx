import { useCallback, useEffect, useState } from "react"

import { Button } from "~/components/ui/button"
import {
  FOLDER_TARGET_ID,
  chooseBackupFolder,
  forgetBackupFolder,
  getFolderStatus,
  reconnectBackupFolder,
  writeFolderBackup,
  type FolderStatus,
} from "~/lib/backup/folder-backup"
import { db } from "~/lib/db/db"
import { formatWhen } from "~/lib/relative-time"
import { formatBytes } from "~/lib/storage-breakdown"
import { toast } from "~/lib/ui/toast-store"
import { cn } from "~/lib/utils"
import type { BackupTarget } from "~/lib/types"

export function BackupFolderPanel() {
  const [status, setStatus] = useState<FolderStatus | undefined>(undefined)
  const [target, setTarget] = useState<BackupTarget | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [nextStatus, nextTarget] = await Promise.all([
      getFolderStatus(),
      db.backupTargets.get(FOLDER_TARGET_ID),
    ])
    setStatus(nextStatus)
    setTarget(nextTarget)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  async function handleChoose() {
    await run(async () => {
      try {
        await chooseBackupFolder()
      } catch (error) {
        // AbortError is the user closing the picker. Not a failure, and saying
        // so would be noise.
        if (error instanceof DOMException && error.name === "AbortError") return
        toast("Couldn't use that folder")
        return
      }
      const outcome = await writeFolderBackup({ force: true })
      toast(
        outcome.written
          ? `Backup folder set — wrote ${outcome.filename}`
          : "Backup folder set"
      )
    })
  }

  async function handleReconnect() {
    await run(async () => {
      const next = await reconnectBackupFolder()
      if (next !== "granted") {
        toast("Still no access to that folder")
        return
      }
      const outcome = await writeFolderBackup({ force: true })
      toast(outcome.written ? "Backup folder reconnected" : "Reconnected")
    })
  }

  async function handleWriteNow() {
    await run(async () => {
      const outcome = await writeFolderBackup({ force: true })
      toast(
        outcome.written
          ? `Wrote ${outcome.filename} (${formatBytes(outcome.bytes)})`
          : "Couldn't write to the backup folder"
      )
    })
  }

  if (status === undefined) {
    return (
      <p className="border border-border p-3 text-13 text-muted-foreground">
        Checking…
      </p>
    )
  }

  if (status === "unsupported") {
    return (
      <p className="border border-border p-3 text-12-5 leading-relaxed text-muted-foreground">
        This browser can&apos;t write to a folder on your disk — the File System
        Access API is Chromium-only today, so Chrome, Edge, Opera and Arc have
        it, and Firefox and Safari don&apos;t. Exporting a backup by hand does
        the same job here.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2 border border-border p-3">
        <span
          className={cn(
            "size-2 rounded-full",
            status === "granted" ? "bg-success" : "bg-muted-foreground"
          )}
        />
        <span className="font-heading text-10 font-semibold tracking-widest uppercase">
          {status === "none"
            ? "No folder chosen"
            : status === "granted"
              ? `Backing up to ${target?.name}`
              : status === "denied"
                ? `Access to ${target?.name} refused`
                : `${target?.name} needs reconnecting`}
        </span>
        {target?.lastWriteAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            Last written {formatWhen(target.lastWriteAt)}
            {target.lastWriteBytes
              ? ` · ${formatBytes(target.lastWriteBytes)}`
              : ""}
          </span>
        )}
      </div>

      {target?.lastError && (
        <p className="border border-destructive/40 bg-destructive/10 p-3 text-12-5 leading-relaxed text-destructive">
          The last write failed: {target.lastError}
        </p>
      )}

      <p className="text-12-5 leading-relaxed text-muted-foreground">
        Pick a folder on your disk and the app keeps a full backup — people,
        relationships, trees and photos — mirrored into it as you work. It never
        leaves your machine: this is a local folder, not a cloud service, so it
        holds even when you&apos;re offline. Point it at a folder your own
        backup tool already covers and you have a real answer to the browser
        clearing its data.
        {status !== "none" && (
          <>
            {" "}
            One file per day, named the same way the manual export is, rewritten
            through the day and never deleted — a month-old backup is worth more
            than a tidy folder.
          </>
        )}
      </p>

      {(status === "prompt" || status === "denied") && (
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          Browsers drop folder access when they restart, and only give it back
          when you ask for it — the app can&apos;t re-grant it on its own.
          Nothing has been written since.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "none" ? (
          <Button size="sm" disabled={busy} onClick={() => void handleChoose()}>
            Choose a backup folder
          </Button>
        ) : (
          <>
            {status === "granted" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void handleWriteNow()}
              >
                Write now
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void handleReconnect()}
              >
                Reconnect
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void handleChoose()}
            >
              Change folder
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await forgetBackupFolder()
                  toast("Backup folder forgotten — files already written stay")
                })
              }
            >
              Stop
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
