import { useState } from "react"

import { PartialDateFields } from "~/components/people/partial-date-fields"
import { PersonForm, type PhotoAction } from "~/components/people/person-form"
import { PersonPicker } from "~/components/people/person-picker"
import { Button } from "~/components/ui/button"
import {
  RelationshipCycleError,
  TooManyParentsError,
} from "~/lib/db/relationships"
import type { RelationshipDates } from "~/lib/db/relationship-actions"
import { Label } from "~/components/ui/label"
import { Select } from "~/components/ui/select"
import { personDisplayName } from "~/lib/person-name"
import type { PersonFormValues } from "~/lib/schemas"
import type { ParentChildSubtype, PartialDate, Person } from "~/lib/types"

// Presented in the order a user is likely to want them, biological first: it is
// both the default and by far the commonest, so it should cost no thought.
export const SUBTYPE_OPTIONS: Array<{
  value: ParentChildSubtype
  label: string
}> = [
  { value: "biological", label: "By birth" },
  { value: "adopted", label: "Adopted" },
  { value: "step", label: "Step" },
  { value: "foster", label: "Foster" },
  { value: "guardian", label: "Guardian" },
]

export type RelativeFormMode = "new" | "existing" | "record-marriage"

interface RelativeFormProps {
  mode: RelativeFormMode
  excludeIds?: string[]
  showDates?: boolean
  // Parent and child adds only — a spouse or sibling link has no subtype to
  // choose (a sibling's link is to the shared parents, recorded there).
  showSubtype?: boolean
  recordMarriageNames?: [string, string]
  onSubmitNew?: (
    values: PersonFormValues,
    dates: RelationshipDates,
    photoAction: PhotoAction,
    subtype?: ParentChildSubtype
  ) => Promise<unknown>
  onSubmitExisting?: (
    person: Person,
    dates: RelationshipDates,
    subtype?: ParentChildSubtype
  ) => Promise<unknown>
  onSubmitMarriage?: (dates: RelationshipDates) => Promise<unknown>
  onCancel: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof TooManyParentsError) {
    return "That person already has 2 parents recorded."
  }
  if (error instanceof RelationshipCycleError) {
    return "That would create a cycle — one of them is already an ancestor of the other."
  }
  return "Something went wrong. Please try again."
}

// Shared marriage-start-date state for the "new" and "record-marriage"
// modes. A freshly recorded marriage has no end date yet — that's set later
// via the detail panel's own edit-dates action, which covers both start/end.
function useMarriageDates() {
  const [start, setStart] = useState<PartialDate | undefined>(undefined)
  return { dates: { start } as RelationshipDates, setStart }
}

export function RelativeForm({
  mode,
  excludeIds = [],
  showDates = false,
  showSubtype = false,
  recordMarriageNames,
  onSubmitNew,
  onSubmitExisting,
  onSubmitMarriage,
  onCancel,
}: RelativeFormProps) {
  const [error, setError] = useState<string | undefined>(undefined)
  const [pickedPerson, setPickedPerson] = useState<Person | undefined>(
    undefined
  )
  const { dates, setStart } = useMarriageDates()
  const [subtype, setSubtype] = useState<ParentChildSubtype>("biological")
  // Left undefined for the default so the stored relationship stays as small as
  // it was before this field existed.
  const chosenSubtype = subtype === "biological" ? undefined : subtype

  const subtypeField = showSubtype ? (
    <div className="flex flex-col gap-1">
      <Label htmlFor="subtype">Relationship</Label>
      <Select
        id="subtype"
        value={subtype}
        onChange={(e) => setSubtype(e.target.value as ParentChildSubtype)}
      >
        {SUBTYPE_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
    </div>
  ) : null

  if (mode === "record-marriage") {
    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      setError(undefined)
      try {
        await onSubmitMarriage?.(dates)
      } catch (err) {
        setError(errorMessage(err))
      }
    }

    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {recordMarriageNames && (
          <p className="text-sm">
            {recordMarriageNames[0]} &amp; {recordMarriageNames[1]}
          </p>
        )}
        <PartialDateFields
          legend="Marriage"
          value={dates.start}
          onChange={setStart}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">Record marriage</Button>
        </div>
      </form>
    )
  }

  if (mode === "new") {
    async function handleSubmit(
      values: PersonFormValues,
      photoAction: PhotoAction
    ) {
      setError(undefined)
      try {
        await onSubmitNew?.(values, dates, photoAction, chosenSubtype)
      } catch (err) {
        setError(errorMessage(err))
      }
    }

    return (
      <div className="flex flex-col gap-4">
        {showDates && (
          <PartialDateFields
            legend="Marriage"
            value={dates.start}
            onChange={setStart}
          />
        )}
        {subtypeField}
        <PersonForm
          onSubmit={handleSubmit}
          onCancel={onCancel}
          submitLabel="Add"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  // mode === "existing"
  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!pickedPerson) return
    setError(undefined)
    try {
      await onSubmitExisting?.(pickedPerson, dates, chosenSubtype)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PersonPicker
        onSelect={setPickedPerson}
        excludeIds={excludeIds}
        placeholder="Search for a person…"
      />
      {pickedPerson && (
        <form onSubmit={handleConfirm} className="flex flex-col gap-4">
          <p className="text-sm">Selected: {personDisplayName(pickedPerson)}</p>
          {showDates && (
            <PartialDateFields
              legend="Marriage"
              value={dates.start}
              onChange={setStart}
            />
          )}
          {subtypeField}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Add</Button>
          </div>
        </form>
      )}
      {!pickedPerson && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
