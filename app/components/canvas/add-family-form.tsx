import { Plus, X } from "lucide-react"
import { useState } from "react"

import { SUBTYPE_OPTIONS } from "~/components/canvas/relative-form"
import { PartialDateFields } from "~/components/people/partial-date-fields"
import { PersonPicker } from "~/components/people/person-picker"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Select } from "~/components/ui/select"
import type { FamilyChild, FamilySpouse } from "~/lib/db/add-family"
import type { RelationshipDates } from "~/lib/db/relationship-actions"
import {
  RelationshipCycleError,
  TooManyParentsError,
} from "~/lib/db/relationships"
import { personDisplayName } from "~/lib/person-name"
import type { ParentChildSubtype, PartialDate, Person, Sex } from "~/lib/types"

// One child, as typed. Deliberately fewer fields than the full person form:
// this is the fast-entry path, and a name plus a birth year is what somebody
// reading a family off a document actually has to hand. Everything else stays
// editable on the person afterwards.
interface ChildDraft {
  givenName: string
  familyName: string
  sex: Sex | ""
  birthYear: string
  subtype: ParentChildSubtype
}

function emptyChild(familyName: string): ChildDraft {
  return {
    givenName: "",
    familyName,
    sex: "",
    birthYear: "",
    subtype: "biological",
  }
}

function toFamilyChild(draft: ChildDraft): FamilyChild {
  const year = Number.parseInt(draft.birthYear, 10)
  const birth: PartialDate | undefined = Number.isFinite(year)
    ? { year }
    : undefined
  return {
    values: {
      givenName: draft.givenName.trim(),
      familyName: draft.familyName.trim() || undefined,
      sex: draft.sex || undefined,
      birth,
    },
    subtype: draft.subtype === "biological" ? undefined : draft.subtype,
  }
}

type SpouseMode = "existing" | "new" | "none"

interface AddFamilyFormProps {
  anchor: Person
  // The people the anchor is already married to. Offered first, because
  // "this couple had these children" is far and away the commonest reason to
  // open this form.
  currentSpouses: Person[]
  onSubmit: (
    spouse: FamilySpouse,
    marriage: RelationshipDates,
    children: FamilyChild[]
  ) => Promise<unknown>
  onCancel: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof TooManyParentsError) {
    return "One of those children already has 2 parents recorded. Nothing was saved."
  }
  if (error instanceof RelationshipCycleError) {
    return "That would create a cycle — one of them is already an ancestor of the other. Nothing was saved."
  }
  return "Something went wrong. Nothing was saved."
}

export function AddFamilyForm({
  anchor,
  currentSpouses,
  onSubmit,
  onCancel,
}: AddFamilyFormProps) {
  const inheritedFamilyName = anchor.familyName ?? ""

  const [spouseMode, setSpouseMode] = useState<SpouseMode>(
    currentSpouses.length > 0 ? "existing" : "new"
  )
  const [pickedSpouseId, setPickedSpouseId] = useState<string | undefined>(
    currentSpouses[0]?.id
  )
  const [pickedPerson, setPickedPerson] = useState<Person | undefined>(
    undefined
  )
  const [newSpouseGiven, setNewSpouseGiven] = useState("")
  const [newSpouseFamily, setNewSpouseFamily] = useState("")
  const [marriageStart, setMarriageStart] = useState<PartialDate | undefined>(
    undefined
  )
  const [children, setChildren] = useState<ChildDraft[]>([
    emptyChild(inheritedFamilyName),
  ])
  const [error, setError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  function updateChild(index: number, patch: Partial<ChildDraft>) {
    setChildren((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }

  function resolveSpouse(): FamilySpouse | undefined {
    if (spouseMode === "none") return { kind: "none" }
    if (spouseMode === "new") {
      const givenName = newSpouseGiven.trim()
      if (!givenName) return undefined
      return {
        kind: "new",
        values: {
          givenName,
          familyName: newSpouseFamily.trim() || undefined,
        },
      }
    }
    // An existing spouse is either one of the current ones (chosen from the
    // list) or somebody picked out of the whole pool.
    const personId = pickedPerson?.id ?? pickedSpouseId
    if (!personId) return undefined
    return { kind: "existing", personId }
  }

  // A blank row is an unfinished edit, not a child. The form starts with one
  // and it should be possible to submit a marriage on its own without first
  // deleting it.
  const namedChildren = children.filter((row) => row.givenName.trim() !== "")
  const spouse = resolveSpouse()
  const canSubmit =
    !saving && !!spouse && (spouse.kind !== "none" || namedChildren.length > 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!spouse) return
    setError(undefined)
    setSaving(true)
    try {
      await onSubmit(
        spouse,
        { start: marriageStart },
        namedChildren.map(toFamilyChild)
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-heading text-9-5 font-semibold text-muted-foreground">
          Other parent
        </p>
        <div className="flex flex-wrap gap-1.5">
          {currentSpouses.length > 0 && (
            <Button
              type="button"
              variant={spouseMode === "existing" ? "secondary" : "outline"}
              size="xs"
              onClick={() => setSpouseMode("existing")}
            >
              Already recorded
            </Button>
          )}
          <Button
            type="button"
            variant={spouseMode === "new" ? "secondary" : "outline"}
            size="xs"
            onClick={() => setSpouseMode("new")}
          >
            New person
          </Button>
          <Button
            type="button"
            variant={spouseMode === "none" ? "secondary" : "outline"}
            size="xs"
            onClick={() => setSpouseMode("none")}
          >
            No second parent
          </Button>
        </div>

        {spouseMode === "existing" && currentSpouses.length > 0 && (
          <Select
            aria-label="Other parent"
            value={pickedSpouseId ?? ""}
            onChange={(e) => {
              setPickedSpouseId(e.target.value)
              setPickedPerson(undefined)
            }}
          >
            {currentSpouses.map((person) => (
              <option key={person.id} value={person.id}>
                {personDisplayName(person)}
              </option>
            ))}
          </Select>
        )}

        {spouseMode === "existing" && currentSpouses.length === 0 && (
          <>
            <PersonPicker
              onSelect={setPickedPerson}
              excludeIds={[anchor.id]}
              placeholder="Search for a person…"
            />
            {pickedPerson && (
              <p className="text-xs">
                Selected: {personDisplayName(pickedPerson)}
              </p>
            )}
          </>
        )}

        {spouseMode === "new" && (
          <div className="flex flex-wrap gap-x-2 gap-y-2">
            <div className="flex min-w-0 flex-1 basis-28 flex-col gap-1">
              <Label htmlFor="family-spouse-given">Given name</Label>
              <Input
                id="family-spouse-given"
                value={newSpouseGiven}
                onChange={(e) => setNewSpouseGiven(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-1 basis-28 flex-col gap-1">
              <Label htmlFor="family-spouse-exists">Family name</Label>
              <Input
                id="family-spouse-exists"
                value={newSpouseFamily}
                onChange={(e) => setNewSpouseFamily(e.target.value)}
              />
            </div>
          </div>
        )}

        {spouseMode !== "none" && (
          <PartialDateFields
            legend="Marriage"
            value={marriageStart}
            onChange={setMarriageStart}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-heading text-9-5 font-semibold text-muted-foreground">
          Children
        </p>
        <p className="text-11 leading-relaxed text-muted-foreground">
          Eldest first — the order you enter them here is the order they'll be
          laid out in.
        </p>
        {children.map((row, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-border/60 p-2"
          >
            <div className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 basis-24 flex-col gap-1">
                <Label htmlFor={`child-given-${index}`}>Given name</Label>
                <Input
                  id={`child-given-${index}`}
                  value={row.givenName}
                  onChange={(e) =>
                    updateChild(index, { givenName: e.target.value })
                  }
                />
              </div>
              <div className="flex min-w-0 flex-1 basis-24 flex-col gap-1">
                <Label htmlFor={`child-family-${index}`}>Family name</Label>
                <Input
                  id={`child-family-${index}`}
                  value={row.familyName}
                  onChange={(e) =>
                    updateChild(index, { familyName: e.target.value })
                  }
                />
              </div>
              {children.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove child ${index + 1}`}
                  onClick={() =>
                    setChildren((rows) => rows.filter((_, i) => i !== index))
                  }
                >
                  <X />
                </Button>
              )}
            </div>
            <div className="flex items-end gap-2 max-md:flex-wrap">
              <div className="flex min-w-0 flex-1 basis-16 flex-col gap-1 max-md:basis-[calc(50%-0.25rem)]">
                <Label htmlFor={`child-born-${index}`}>Born</Label>
                <Input
                  id={`child-born-${index}`}
                  inputMode="numeric"
                  placeholder="Year"
                  value={row.birthYear}
                  onChange={(e) =>
                    updateChild(index, { birthYear: e.target.value })
                  }
                />
              </div>
              <div className="flex min-w-0 flex-1 basis-20 flex-col gap-1 max-md:basis-[calc(50%-0.25rem)]">
                <Label htmlFor={`child-sex-${index}`}>Sex</Label>
                <Select
                  id={`child-sex-${index}`}
                  value={row.sex}
                  onChange={(e) =>
                    updateChild(index, { sex: e.target.value as Sex | "" })
                  }
                >
                  <option value="">Not recorded</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div className="flex min-w-0 flex-1 basis-24 flex-col gap-1 max-md:basis-full">
                <Label htmlFor={`child-subtype-${index}`}>Relationship</Label>
                <Select
                  id={`child-subtype-${index}`}
                  value={row.subtype}
                  onChange={(e) =>
                    updateChild(index, {
                      subtype: e.target.value as ParentChildSubtype,
                    })
                  }
                >
                  {SUBTYPE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        ))}
        <div className="flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setChildren((rows) => [...rows, emptyChild(inheritedFamilyName)])
            }
          >
            <Plus /> Another child
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {saving ? "Saving…" : "Add family"}
        </Button>
      </div>
    </form>
  )
}
