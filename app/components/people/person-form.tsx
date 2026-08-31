import { useEffect, useRef, useState } from "react"
import type { ZodError } from "zod"

import { PartialDateFields } from "~/components/people/partial-date-fields"
import { PersonAvatar } from "~/components/people/person-avatar"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import { resizeAndCompressImage } from "~/lib/photos"
import { PersonFormSchema, type PersonFormValues } from "~/lib/schemas"

export type PhotoAction =
  | { kind: "unchanged" }
  | { kind: "staged"; blob: Blob; mime: string }
  | { kind: "removed" }

// Which fields this instance *renders*. Every field is still held in state
// and submitted whatever the section, so saving from the "details" tab can't
// silently blank out notes edited on the "notes" tab (and vice versa).
export type PersonFormSection = "all" | "details" | "notes"

interface PersonFormProps {
  initialValues?: Partial<PersonFormValues>
  onSubmit: (values: PersonFormValues, photoAction: PhotoAction) => void
  onCancel?: () => void
  submitLabel?: string
  cancelLabel?: string
  section?: PersonFormSection
}

export function PersonForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  section = "all",
}: PersonFormProps) {
  const showIdentity = section !== "notes"
  const showNotes = section !== "details"

  const [givenName, setGivenName] = useState(initialValues?.givenName ?? "")
  const [familyName, setFamilyName] = useState(initialValues?.familyName ?? "")
  const [birth, setBirth] = useState(initialValues?.birth)
  const [death, setDeath] = useState(initialValues?.death)
  const [notes, setNotes] = useState(initialValues?.notes ?? "")
  const [error, setError] = useState<ZodError | undefined>(undefined)

  const [photoAction, setPhotoAction] = useState<PhotoAction>({
    kind: "unchanged",
  })
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | undefined>(
    undefined
  )
  const [photoError, setPhotoError] = useState<string | undefined>(undefined)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Revoke the staged preview's object URL whenever it's replaced or the form unmounts.
  useEffect(() => {
    return () => {
      if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl)
    }
  }, [stagedPreviewUrl])

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.")
      return
    }

    setPhotoError(undefined)
    setProcessingPhoto(true)
    try {
      const resized = await resizeAndCompressImage(file)
      if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl)
      setStagedPreviewUrl(URL.createObjectURL(resized))
      setPhotoAction({ kind: "staged", blob: resized, mime: "image/jpeg" })
    } catch {
      setPhotoError("Couldn't process that image.")
    } finally {
      setProcessingPhoto(false)
    }
  }

  function handleRemovePhoto() {
    if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl)
    setStagedPreviewUrl(undefined)
    setPhotoAction({ kind: "removed" })
  }

  const hasPhoto =
    photoAction.kind === "staged" ||
    (photoAction.kind === "unchanged" && !!initialValues?.photoId)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const result = PersonFormSchema.safeParse({
      givenName,
      familyName: familyName || undefined,
      birth,
      death,
      notes: notes || undefined,
      isPlaceholder: initialValues?.isPlaceholder,
    })

    if (!result.success) {
      setError(result.error)
      return
    }

    setError(undefined)
    onSubmit(result.data, photoAction)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showIdentity && (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="givenName">Given name</Label>
            <Input
              id="givenName"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="familyName">Family name</Label>
            <Input
              id="familyName"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
            />
          </div>

          <PartialDateFields legend="Birth" value={birth} onChange={setBirth} />
          <PartialDateFields legend="Death" value={death} onChange={setDeath} />
        </>
      )}

      {showNotes && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Places, stories, sources…"
            className="min-h-35"
          />
        </div>
      )}

      {showIdentity && (
        <div className="flex flex-col gap-1">
          <Label>Photo</Label>
          <div className="flex items-center gap-3">
            {stagedPreviewUrl ? (
              <img
                src={stagedPreviewUrl}
                alt=""
                className="size-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <PersonAvatar
                photoId={
                  photoAction.kind === "unchanged"
                    ? initialValues?.photoId
                    : undefined
                }
                size="lg"
              />
            )}
            <div className="flex flex-col gap-1">
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={processingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {processingPhoto
                    ? "Processing…"
                    : hasPhoto
                      ? "Change photo"
                      : "Add photo"}
                </Button>
                {hasPhoto && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemovePhoto}
                  >
                    Remove
                  </Button>
                )}
              </div>
              {photoError && (
                <p className="text-sm text-destructive">{photoError}</p>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelected}
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">
          {error.issues[0]?.message ?? "Invalid input."}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
