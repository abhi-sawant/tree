import { useRef, useState } from "react"

import { Button } from "~/components/ui/button"
import { usePhotoUrls } from "~/lib/db/hooks"
import { movePhotoId, personPhotoIds } from "~/lib/person-photos"
import {
  addPersonPhoto,
  removePersonPhotoById,
  resizeAndCompressImage,
  setPersonCoverPhoto,
  setPersonPhotoOrder,
} from "~/lib/photos"
import { toast } from "~/lib/ui/toast-store"
import { cn } from "~/lib/utils"
import type { Person } from "~/lib/types"

interface PersonPhotosPanelProps {
  person: Person
}

// The gallery for one person. Unlike the person form's single avatar, every
// action here writes immediately — the panel is looking at a person who already
// exists, so there is nothing to stage against a later submit, and a reorder
// that only took effect on Save would be a surprising way to lose one.
export function PersonPhotosPanel({ person }: PersonPhotosPanelProps) {
  const photoIds = personPhotoIds(person)
  const urls = usePhotoUrls(photoIds)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    // Resetting the input's value rather than remounting it: the same file
    // picked twice in a row must still fire a change event.
    e.target.value = ""
    if (files.length === 0) return

    const images = files.filter((file) => file.type.startsWith("image/"))
    setError(
      images.length === files.length
        ? undefined
        : "Some of those weren't images and were skipped."
    )
    if (images.length === 0) return

    setBusy(true)
    let added = 0
    try {
      // Sequential, for the reason recompressAllPhotos is: each step decodes a
      // full-size bitmap, and a phone browser will kill the tab if a dozen of
      // those run at once.
      for (const file of images) {
        try {
          const resized = await resizeAndCompressImage(file)
          await addPersonPhoto(person.id, resized, "image/jpeg")
          added += 1
        } catch {
          setError(`Couldn't process “${file.name}” — it was skipped.`)
        }
      }
    } finally {
      setBusy(false)
    }
    if (added > 0) toast(added === 1 ? "Photo added" : `${added} photos added`)
  }

  async function handleMove(index: number, delta: number) {
    const next = movePhotoId(photoIds, index, index + delta)
    if (next === photoIds) return
    await setPersonPhotoOrder(person.id, next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? "Adding…" : "Add photos"}
        </Button>
        <span className="text-11 text-muted-foreground">
          {photoIds.length === 0
            ? "No photos yet"
            : photoIds.length === 1
              ? "1 photo"
              : `${photoIds.length} photos`}
        </span>
      </div>

      {error && <p className="text-12-5 text-destructive">{error}</p>}

      {photoIds.length > 0 && (
        <p className="text-11 leading-snug text-muted-foreground">
          The first photo is the cover — it&apos;s the one shown on the card, in
          the people table and in exports.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {photoIds.map((photoId, index) => (
          <li
            key={photoId}
            className="flex items-center gap-3 border border-border p-2"
          >
            {/* A photo row whose blob is missing still renders, with its
                controls, so the reference can be removed. Hiding it would
                leave an entry the user can see the count of but not reach. */}
            <img
              src={urls.get(photoId) ?? "/user.png"}
              alt=""
              className="size-14 shrink-0 rounded object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                className={cn(
                  "font-heading text-10 font-semibold tracking-widest uppercase",
                  index === 0 ? "text-primary" : "text-muted-foreground"
                )}
              >
                {index === 0 ? "Cover" : `Photo ${index + 1}`}
              </span>
              <div className="flex flex-wrap gap-1">
                {index > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => void setPersonCoverPhoto(person.id, photoId)}
                  >
                    Make cover
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={index === 0}
                  onClick={() => void handleMove(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={index === photoIds.length - 1}
                  onClick={() => void handleMove(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    void removePersonPhotoById(person.id, photoId).then(() =>
                      toast("Photo removed")
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFilesSelected(e)}
      />
    </div>
  )
}
