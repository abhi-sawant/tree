import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import {
  MAX_SNAPSHOTS,
  createSnapshot,
  deleteSnapshot,
  restoreSnapshot,
  type SnapshotSummary,
} from "~/lib/backup/snapshots"
import { useSnapshots } from "~/lib/db/hooks"
import { formatWhen } from "~/lib/relative-time"
import { formatBytes } from "~/lib/storage-breakdown"
import { toast } from "~/lib/ui/toast-store"
import type { SnapshotReason } from "~/lib/types"

const REASON_LABEL: Record<SnapshotReason, string> = {
  auto: "Automatic",
  manual: "Taken by you",
  "pre-restore": "Before a restore",
}

export function SnapshotsPanel() {
  const snapshots = useSnapshots()
  const [taking, setTaking] = useState(false)
  const [pending, setPending] = useState<SnapshotSummary | undefined>(undefined)
  const [restoring, setRestoring] = useState(false)

  const totalBytes = (snapshots ?? []).reduce(
    (total, snapshot) => total + snapshot.size,
    0
  )

  async function handleSnapshotNow() {
    if (taking) return
    setTaking(true)
    try {
      await createSnapshot("manual")
      toast("Snapshot saved")
    } catch {
      toast("Couldn't save a snapshot")
    } finally {
      setTaking(false)
    }
  }

  async function handleRestore() {
    if (!pending || restoring) return
    setRestoring(true)
    try {
      const result = await restoreSnapshot(pending.id)
      // A reload destroys any toast before it renders, and every open view is
      // now showing data that no longer exists — same reasoning as the backup
      // import path in settings-view.
      if (result.clearedPhotoIds.length > 0) {
        window.alert(
          `Restored. ${result.clearedPhotoIds.length} restored ${
            result.clearedPhotoIds.length === 1 ? "person" : "people"
          } had a photo that is no longer stored in this browser, so those now show the default avatar.`
        )
      }
      window.location.reload()
    } catch {
      setRestoring(false)
      setPending(undefined)
      toast("Restore failed — nothing was changed")
    }
  }

  async function handleDelete(snapshot: SnapshotSummary) {
    try {
      await deleteSnapshot(snapshot.id)
    } catch {
      toast("Couldn't delete that snapshot")
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-12-5 leading-relaxed text-muted-foreground">
        A snapshot is a rollback point kept inside this browser, taken
        automatically as you work and pruned to the last {MAX_SNAPSHOTS}. It
        covers names, dates, relationships and trees — not photos, which would
        multiply your storage use by {MAX_SNAPSHOTS} for the part of the data
        least likely to be lost by a mistake. Restoring leaves the photos in
        this browser untouched, so someone brought back after being deleted
        returns without their picture. Snapshots live in the same storage as
        everything else, so they protect you from a wrong merge or a mistaken
        delete — not from the browser clearing its data. That is what an
        exported backup is for.
      </p>

      {snapshots && snapshots.length > 0 ? (
        <ul className="flex flex-col border border-border">
          {snapshots.map((snapshot) => (
            <li
              key={snapshot.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-2.5 last:border-b-0"
            >
              <div className="flex min-w-40 flex-col">
                <span className="text-13 font-medium">
                  {formatWhen(snapshot.createdAt)}
                </span>
                <span className="text-11 text-muted-foreground">
                  {REASON_LABEL[snapshot.reason]} · {snapshot.counts.people}{" "}
                  {snapshot.counts.people === 1 ? "person" : "people"} ·{" "}
                  {snapshot.counts.relationships} links ·{" "}
                  {formatBytes(snapshot.size)}
                </span>
              </div>
              <div className="ml-auto flex gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setPending(snapshot)}
                >
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void handleDelete(snapshot)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border border-border p-3 text-13">
          No snapshots yet. One is taken shortly after your next edit.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={taking}
          onClick={() => void handleSnapshotNow()}
        >
          {taking ? "Saving…" : "Snapshot now"}
        </Button>
        {totalBytes > 0 && (
          <span className="text-xs text-muted-foreground">
            {formatBytes(totalBytes)} in total
          </span>
        )}
      </div>

      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => !open && !restoring && setPending(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Roll back to {pending && formatWhen(pending.createdAt)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every person, relationship and tree goes back to how it was then —
              {pending
                ? ` ${pending.counts.people} people and ${pending.counts.relationships} links`
                : ""}
              . Anything added since is removed. A snapshot of the current state
              is saved first, so this is reversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={restoring}
              onClick={() => void handleRestore()}
            >
              {restoring ? "Restoring…" : "Roll back"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
