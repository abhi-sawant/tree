import { Plus, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { ZodError } from "zod"

import { PartialDateFields } from "~/components/people/partial-date-fields"
import { PersonAvatar } from "~/components/people/person-avatar"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Select } from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import { resizeAndCompressImage } from "~/lib/photos"
import { PersonFormSchema, type PersonFormValues } from "~/lib/schemas"
import type { CustomField, Sex } from "~/lib/types"

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
  const [maidenName, setMaidenName] = useState(initialValues?.maidenName ?? "")
  const [nickname, setNickname] = useState(initialValues?.nickname ?? "")
  const [sex, setSex] = useState<Sex | "">(initialValues?.sex ?? "")
  const [birth, setBirth] = useState(initialValues?.birth)
  const [death, setDeath] = useState(initialValues?.death)
  const [notes, setNotes] = useState(initialValues?.notes ?? "")
  const [customFields, setCustomFields] = useState<CustomField[]>(
    initialValues?.customFields ?? []
  )
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

  const cleanedCustomFields = customFields
    .map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
    .filter(({ label }) => label !== "")

  function updateCustomField(index: number, patch: Partial<CustomField>) {
    setCustomFields((fields) =>
      fields.map((field, i) => (i === index ? { ...field, ...patch } : field))
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const result = PersonFormSchema.safeParse({
      givenName,
      familyName: familyName || undefined,
      maidenName: maidenName || undefined,
      nickname: nickname || undefined,
      sex: sex || undefined,
      birth,
      death,
      notes: notes || undefined,
      // A row with no label is an unfinished edit, not data — dropping it here
      // is friendlier than failing the schema's min(1) and blocking the save.
      customFields: cleanedCustomFields.length
        ? cleanedCustomFields
        : undefined,
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

          <div className="flex flex-wrap gap-x-3 gap-y-4">
            <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
              <Label htmlFor="maidenName">Maiden name</Label>
              <Input
                id="maidenName"
                value={maidenName}
                onChange={(e) => setMaidenName(e.target.value)}
                placeholder="If different"
              />
            </div>
            <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
              <Label htmlFor="nickname">Nickname</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="sex">Sex</Label>
            <Select
              id="sex"
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex | "")}
            >
              <option value="">Not recorded</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </Select>
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
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-semibold tracking-wide uppercase">
            Other details
          </legend>
          {customFields.map((field, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 basis-32 flex-col gap-1">
                <Label htmlFor={`custom-label-${index}`}>Label</Label>
                <Input
                  id={`custom-label-${index}`}
                  value={field.label}
                  onChange={(e) =>
                    updateCustomField(index, { label: e.target.value })
                  }
                  placeholder="Occupation"
                />
              </div>
              <div className="flex min-w-0 flex-1 basis-32 flex-col gap-1">
                <Label htmlFor={`custom-value-${index}`}>Value</Label>
                <Input
                  id={`custom-value-${index}`}
                  value={field.value}
                  onChange={(e) =>
                    updateCustomField(index, { value: e.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${field.label || "field"}`}
                onClick={() =>
                  setCustomFields((fields) =>
                    fields.filter((_, i) => i !== index)
                  )
                }
              >
                <X />
              </Button>
            </div>
          ))}
          <div className="flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setCustomFields((fields) => [
                  ...fields,
                  { label: "", value: "" },
                ])
              }
            >
              <Plus /> Add a detail
            </Button>
          </div>
        </fieldset>
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
