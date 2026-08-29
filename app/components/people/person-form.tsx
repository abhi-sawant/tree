import { useState } from "react"
import type { ZodError } from "zod"

import { PartialDateFields } from "~/components/people/partial-date-fields"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import { PersonFormSchema, type PersonFormValues } from "~/lib/schemas"

interface PersonFormProps {
  initialValues?: Partial<PersonFormValues>
  onSubmit: (values: PersonFormValues) => void
  onCancel?: () => void
  submitLabel?: string
}

export function PersonForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: PersonFormProps) {
  const [givenName, setGivenName] = useState(initialValues?.givenName ?? "")
  const [familyName, setFamilyName] = useState(initialValues?.familyName ?? "")
  const [birth, setBirth] = useState(initialValues?.birth)
  const [death, setDeath] = useState(initialValues?.death)
  const [notes, setNotes] = useState(initialValues?.notes ?? "")
  const [error, setError] = useState<ZodError | undefined>(undefined)

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
    onSubmit(result.data)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        <Input id="familyName" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
      </div>

      <PartialDateFields legend="Birth" value={birth} onChange={setBirth} />
      <PartialDateFields legend="Death" value={death} onChange={setDeath} />

      <div className="flex flex-col gap-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1">
        <Label>Photo</Label>
        <p className="text-sm text-muted-foreground">Photo upload coming soon.</p>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error.issues[0]?.message ?? "Invalid input."}</p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
