import { useState } from "react"

import { PartialDateFields } from "~/components/people/partial-date-fields"
import { PersonForm } from "~/components/people/person-form"
import { PersonPicker } from "~/components/people/person-picker"
import { Button } from "~/components/ui/button"
import {
  RelationshipCycleError,
  TooManyParentsError,
} from "~/lib/db/relationships"
import type { RelationshipDates } from "~/lib/db/relationship-actions"
import type { PersonFormValues } from "~/lib/schemas"
import type { PartialDate, Person } from "~/lib/types"

export type RelativeFormMode = "new" | "existing" | "record-marriage"

interface RelativeFormProps {
  mode: RelativeFormMode
  excludeIds?: string[]
  showDates?: boolean
  recordMarriageNames?: [string, string]
  onSubmitNew?: (
    values: PersonFormValues,
    dates: RelationshipDates
  ) => Promise<unknown>
  onSubmitExisting?: (
    person: Person,
    dates: RelationshipDates
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
    async function handleSubmit(values: PersonFormValues) {
      setError(undefined)
      try {
        await onSubmitNew?.(values, dates)
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
      await onSubmitExisting?.(pickedPerson, dates)
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
          <p className="text-sm">
            Selected:{" "}
            {[pickedPerson.givenName, pickedPerson.familyName]
              .filter(Boolean)
              .join(" ")}
          </p>
          {showDates && (
            <PartialDateFields
              legend="Marriage"
              value={dates.start}
              onChange={setStart}
            />
          )}
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
