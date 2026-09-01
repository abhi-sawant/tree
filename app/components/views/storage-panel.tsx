import { useCallback, useEffect, useState } from "react"

import { Button } from "~/components/ui/button"
import { usePeople } from "~/lib/db/hooks"
import { readAttachmentSizes } from "~/lib/db/attachments"
import { readPhotoSizes } from "~/lib/db/photo-sizes"
import { recompressAllPhotos } from "~/lib/photos"
import {
  buildStorageBreakdown,
  formatBytes,
  usedPercent,
  type StorageBreakdown,
} from "~/lib/storage-breakdown"
import { estimateStorage, type StorageUsage } from "~/lib/storage"
import { toast } from "~/lib/ui/toast-store"

// §5.2 asks for the risk to be legible. That means two numbers side by side
// with their difference explained, not one number that looks authoritative:
// the browser's estimate covers the whole origin and is deliberately padded,
// while the photo total is measured here byte for byte.
export function StoragePanel() {
  const people = usePeople()
  const [usage, setUsage] = useState<StorageUsage | undefined>(undefined)
  const [photoSizes, setPhotoSizes] = useState<
    Awaited<ReturnType<typeof readPhotoSizes>> | undefined
  >(undefined)
  const [attachmentSizes, setAttachmentSizes] = useState<
    Awaited<ReturnType<typeof readAttachmentSizes>> | undefined
  >(undefined)
  const [breakdown, setBreakdown] = useState<StorageBreakdown | undefined>(
    undefined
  )
  const [recompressing, setRecompressing] = useState<string | undefined>(
    undefined
  )

  const measure = useCallback(async () => {
    const [estimate, sizes, attachments] = await Promise.all([
      estimateStorage(),
      readPhotoSizes(),
      readAttachmentSizes(),
    ])
    setUsage(estimate)
    setPhotoSizes(sizes)
    setAttachmentSizes(attachments)
  }, [])

  useEffect(() => {
    void measure()
  }, [measure])

  // The join with people is cheap and reactive; the blob measurement above is
  // not, so only the former re-runs when somebody is renamed.
  useEffect(() => {
    if (!photoSizes || !attachmentSizes || !people) return
    setBreakdown(
      buildStorageBreakdown(photoSizes, people, {
        attachments: attachmentSizes,
      })
    )
  }, [photoSizes, attachmentSizes, people])

  async function handleRecompress() {
    if (recompressing) return
    setRecompressing("Starting…")
    try {
      const summary = await recompressAllPhotos({
        onProgress: (done, total) => setRecompressing(`${done} of ${total}…`),
      })
      await measure()
      const saved = summary.bytesBefore - summary.bytesAfter
      toast(
        summary.replaced === 0
          ? "Nothing to reclaim — every photo is already as small as it usefully gets"
          : `Re-compressed ${summary.replaced} of ${summary.considered} photos, freeing ${formatBytes(saved)}`
      )
    } catch {
      toast("Re-compression failed — no photo was changed")
    } finally {
      setRecompressing(undefined)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {usage ? (
        <div className="flex flex-col gap-1.5 border border-border p-3">
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-10 font-semibold tracking-widest uppercase">
              Browser storage
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatBytes(usage.usage)} of {formatBytes(usage.quota)} —{" "}
              {usedPercent(usage.usage, usage.quota)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{
                width: `${Math.max(usedPercent(usage.usage, usage.quota), 1)}%`,
              }}
            />
          </div>
        </div>
      ) : (
        <p className="border border-border p-3 text-12-5 text-muted-foreground">
          This browser doesn&apos;t report a storage quota.
        </p>
      )}

      {breakdown && (
        <div className="flex flex-col gap-1.5 border border-border p-3">
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-10 font-semibold tracking-widest uppercase">
              Photos
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {breakdown.photoCount}{" "}
              {breakdown.photoCount === 1 ? "photo" : "photos"},{" "}
              {formatBytes(breakdown.photoBytes)}
            </span>
          </div>
          {breakdown.orphanCount > 0 && (
            <p className="text-11 leading-snug text-muted-foreground">
              {breakdown.orphanCount} of them{" "}
              {breakdown.orphanCount === 1 ? "belongs" : "belong"} to nobody (
              {formatBytes(breakdown.orphanBytes)}) — most likely left behind by
              an import that didn&apos;t finish.
            </p>
          )}
          {breakdown.largest.length > 0 && (
            <ul className="mt-1 flex flex-col">
              {breakdown.largest.map((photo) => (
                <li
                  key={photo.photoId}
                  className="flex items-baseline gap-2 border-t border-border py-1 text-12-5 first:border-t-0"
                >
                  <span className="truncate">
                    {photo.name ?? (
                      <span className="text-muted-foreground italic">
                        Unattached
                      </span>
                    )}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                    {formatBytes(photo.size)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {breakdown && breakdown.attachmentCount > 0 && (
        <div className="flex flex-col gap-1.5 border border-border p-3">
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-10 font-semibold tracking-widest uppercase">
              Documents
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {breakdown.attachmentCount}{" "}
              {breakdown.attachmentCount === 1 ? "file" : "files"},{" "}
              {formatBytes(breakdown.attachmentBytes)}
            </span>
          </div>
          <ul className="mt-1 flex flex-col">
            {breakdown.largestAttachments.map((attachment) => (
              <li
                key={attachment.attachmentId}
                className="flex items-baseline gap-2 border-t border-border py-1 text-12-5 first:border-t-0"
              >
                <span className="truncate">{attachment.name}</span>
                {attachment.ownerName && (
                  <span className="shrink-0 text-11 text-muted-foreground">
                    {attachment.ownerName}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                  {formatBytes(attachment.size)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-12-5 leading-relaxed text-muted-foreground">
        Everything lives in this browser. Nothing is uploaded — export a backup
        regularly. The quota above is the browser&apos;s own estimate for this
        whole site, padded on purpose and covering more than the family data;
        the photo total is measured here exactly. Uploads are already capped at
        800px, so re-compressing only helps photos that came from an older
        backup — anything that wouldn&apos;t get meaningfully smaller is left
        untouched rather than re-encoded for nothing. Documents are stored
        exactly as they were added, since shrinking a scan would destroy the
        detail it was kept for, so they are usually the largest thing here.
      </p>

      {breakdown && breakdown.photoCount > 0 && (
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={!!recompressing}
            onClick={() => void handleRecompress()}
          >
            {recompressing ?? "Re-compress photos"}
          </Button>
        </div>
      )}
    </div>
  )
}
