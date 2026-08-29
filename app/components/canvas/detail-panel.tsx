import { useEffect, useMemo, useState } from "react"

import {
  AddRelativeMenu,
  type AddAction,
} from "~/components/canvas/add-relative-menu"
import { RelativeForm } from "~/components/canvas/relative-form"
import { PersonForm } from "~/components/people/person-form"
import { PlaceholderBadge } from "~/components/people/placeholder-badge"
import { PartialDateFields } from "~/components/people/partial-date-fields"
import { Button } from "~/components/ui/button"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { resolveSelection } from "~/lib/canvas/resolve-selection"
import type { UnionNode } from "~/lib/graph/derive-unions"
import { updatePerson } from "~/lib/db/people"
import {
  addChildExisting,
  addChildNew,
  addParentExisting,
  addParentNew,
  addSiblingExisting,
  addSiblingNew,
  addSpouseExisting,
  addSpouseNew,
  recordMarriage,
  updateRelationshipDates,
  type RelationshipDates,
} from "~/lib/db/relationship-actions"
import { removeRelationship } from "~/lib/db/relationships"
import { formatPartialDate } from "~/lib/partial-date"
import type { PersonFormValues } from "~/lib/schemas"
import type { Person, Relationship } from "~/lib/types"

interface DetailPanelProps {
  treeId: string
  people: Person[]
  relationships: Relationship[]
  unions: UnionNode[]
}

function personName(person: Person | undefined): string {
  if (!person) return "Unknown"
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ") || "Unnamed"
  )
}

export function DetailPanel({
  treeId,
  people,
  relationships,
  unions,
}: DetailPanelProps) {
  const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId)
  const pendingMarriage = useCanvasUIStore((s) => s.pendingMarriage)
  const clearPendingMarriage = useCanvasUIStore((s) => s.clearPendingMarriage)

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people]
  )
  const selection = useMemo(
    () => resolveSelection(selectedNodeId, people, unions),
    [selectedNodeId, people, unions]
  )

  const [action, setAction] = useState<AddAction | undefined>(undefined)

  // A new selection always starts with no add-relative sub-form open.
  useEffect(() => {
    setAction(undefined)
  }, [selectedNodeId])

  // One-shot handoff from an implicit union's "Record marriage" context menu.
  useEffect(() => {
    if (!pendingMarriage || selection?.kind !== "union") return
    const [pa, pb] = pendingMarriage.parents
    const [ua, ub] = selection.union.parents
    if (!((pa === ua && pb === ub) || (pa === ub && pb === ua))) return
    setAction({ kind: "add-spouse", mode: "record-marriage" })
    clearPendingMarriage()
  }, [pendingMarriage, selection, clearPendingMarriage])

  if (!selection) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Select a person or couple on the canvas to see details.
        </p>
      </aside>
    )
  }

  return (
    <aside
      key={selectedNodeId}
      className="flex h-full w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l border-border bg-card p-4"
    >
      {selection.kind === "person" ? (
        <PersonDetail
          treeId={treeId}
          person={selection.person}
          people={peopleById}
          relationships={relationships}
          action={action}
          setAction={setAction}
        />
      ) : (
        <UnionDetail
          treeId={treeId}
          union={selection.union}
          people={peopleById}
          action={action}
          setAction={setAction}
        />
      )}
    </aside>
  )
}

interface PersonDetailProps {
  treeId: string
  person: Person
  people: Map<string, Person>
  relationships: Relationship[]
  action: AddAction | undefined
  setAction: (action: AddAction | undefined) => void
}

function PersonDetail({
  treeId,
  person,
  people,
  relationships,
  action,
  setAction,
}: PersonDetailProps) {
  const parentRels = relationships.filter(
    (r) => r.type === "parent-child" && r.to === person.id
  )
  const childRels = relationships.filter(
    (r) => r.type === "parent-child" && r.from === person.id
  )
  const spouseRels = relationships.filter(
    (r) => r.type === "spouse" && (r.from === person.id || r.to === person.id)
  )

  async function handleUpdatePerson(values: PersonFormValues) {
    await updatePerson(person.id, values)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-base font-semibold tracking-wide uppercase">
          {personName(person)}
        </h2>
        {person.isPlaceholder && <PlaceholderBadge />}
      </div>

      <PersonForm
        key={person.id}
        initialValues={person}
        onSubmit={handleUpdatePerson}
        submitLabel="Save changes"
      />

      <RelationshipList
        title="Parents"
        relationships={parentRels}
        otherPersonId={(r) => r.from}
        people={people}
      />
      <RelationshipList
        title="Spouses"
        relationships={spouseRels}
        otherPersonId={(r) => (r.from === person.id ? r.to : r.from)}
        people={people}
        showDates
      />
      <RelationshipList
        title="Children"
        relationships={childRels}
        otherPersonId={(r) => r.to}
        people={people}
      />

      <AddRelativeMenu
        selection={{ kind: "person", person }}
        parentCount={parentRels.length}
        onOpenAction={setAction}
      />

      {action && (
        <RelativeForm
          mode={action.mode}
          excludeIds={
            action.kind === "add-parent"
              ? [person.id, ...parentRels.map((r) => r.from)]
              : [person.id]
          }
          showDates={action.kind === "add-spouse"}
          onSubmitNew={async (values, dates) => {
            if (action.kind === "add-parent")
              await addParentNew(person.id, treeId, values)
            else if (action.kind === "add-spouse")
              await addSpouseNew(person.id, treeId, values, dates)
            else if (action.kind === "add-child")
              await addChildNew(
                { kind: "person", personId: person.id },
                treeId,
                values
              )
            else if (action.kind === "add-sibling")
              await addSiblingNew(person.id, treeId, values)
            setAction(undefined)
          }}
          onSubmitExisting={async (picked, dates) => {
            if (action.kind === "add-parent")
              await addParentExisting(person.id, treeId, picked.id)
            else if (action.kind === "add-spouse")
              await addSpouseExisting(person.id, treeId, picked.id, dates)
            else if (action.kind === "add-child")
              await addChildExisting(
                { kind: "person", personId: person.id },
                treeId,
                picked.id
              )
            else if (action.kind === "add-sibling")
              await addSiblingExisting(person.id, treeId, picked.id)
            setAction(undefined)
          }}
          onCancel={() => setAction(undefined)}
        />
      )}
    </>
  )
}

interface UnionDetailProps {
  treeId: string
  union: UnionNode
  people: Map<string, Person>
  action: AddAction | undefined
  setAction: (action: AddAction | undefined) => void
}

function UnionDetail({
  treeId,
  union,
  people,
  action,
  setAction,
}: UnionDetailProps) {
  const [a, b] = union.parents
  const nameA = personName(people.get(a))
  const nameB = personName(people.get(b))

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-semibold tracking-wide uppercase">
          {nameA} &amp; {nameB}
        </h2>
        {union.kind === "real" ? (
          <UnionMarriageEditor union={union} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Not yet recorded as married.
          </p>
        )}
      </div>

      {union.kind === "implicit" && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setAction({ kind: "add-spouse", mode: "record-marriage" })
          }
        >
          Record marriage
        </Button>
      )}

      <AddRelativeMenu
        selection={{ kind: "union", union }}
        parentCount={0}
        onOpenAction={setAction}
      />

      {action && (
        <RelativeForm
          mode={action.mode}
          excludeIds={union.parents}
          recordMarriageNames={[nameA, nameB]}
          onSubmitNew={async (values) => {
            await addChildNew(
              { kind: "union", parents: union.parents },
              treeId,
              values
            )
            setAction(undefined)
          }}
          onSubmitExisting={async (picked) => {
            await addChildExisting(
              { kind: "union", parents: union.parents },
              treeId,
              picked.id
            )
            setAction(undefined)
          }}
          onSubmitMarriage={async (dates) => {
            await recordMarriage(union.parents, dates)
            setAction(undefined)
          }}
          onCancel={() => setAction(undefined)}
        />
      )}
    </>
  )
}

function UnionMarriageEditor({ union }: { union: UnionNode }) {
  const [editing, setEditing] = useState(false)
  if (!union.relationshipId) return null

  const relationship: Relationship = {
    id: union.relationshipId,
    type: "spouse",
    from: union.parents[0],
    to: union.parents[1],
    start: union.start,
    end: union.end,
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Married {formatPartialDate(union.start) || "(date unknown)"}
          {union.end && ` – ${formatPartialDate(union.end)}`}
        </p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Cancel" : "Edit dates"}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => removeRelationship(relationship.id)}
          >
            Remove
          </Button>
        </div>
      </div>
      {editing && (
        <EditRelationshipDates
          relationship={relationship}
          onDone={() => setEditing(false)}
        />
      )}
    </div>
  )
}

interface RelationshipListProps {
  title: string
  relationships: Relationship[]
  otherPersonId: (r: Relationship) => string
  people: Map<string, Person>
  showDates?: boolean
}

function RelationshipList({
  title,
  relationships,
  otherPersonId,
  people,
  showDates = false,
}: RelationshipListProps) {
  const [editingId, setEditingId] = useState<string | undefined>(undefined)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      {relationships.length === 0 && (
        <p className="text-sm text-muted-foreground">None recorded.</p>
      )}
      {relationships.map((r) => {
        const other = people.get(otherPersonId(r))
        const isEditing = editingId === r.id
        return (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-md border border-border p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-sm">{personName(other)}</span>
                {showDates && (r.start || r.end) && (
                  <span className="text-xs text-muted-foreground">
                    {formatPartialDate(r.start)}
                    {r.end && ` – ${formatPartialDate(r.end)}`}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {showDates && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setEditingId(isEditing ? undefined : r.id)}
                  >
                    {isEditing ? "Cancel" : "Edit dates"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => removeRelationship(r.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
            {isEditing && (
              <EditRelationshipDates
                relationship={r}
                onDone={() => setEditingId(undefined)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function EditRelationshipDates({
  relationship,
  onDone,
}: {
  relationship: Relationship
  onDone: () => void
}) {
  const [start, setStart] = useState(relationship.start)
  const [end, setEnd] = useState(relationship.end)

  async function handleSave() {
    const dates: RelationshipDates = { start, end }
    await updateRelationshipDates(relationship, dates)
    onDone()
  }

  return (
    <div className="flex flex-col gap-2">
      <PartialDateFields legend="Start" value={start} onChange={setStart} />
      <PartialDateFields legend="End" value={end} onChange={setEnd} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="xs" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="xs" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  )
}
