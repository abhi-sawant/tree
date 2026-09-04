import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { MoreHorizontal, XIcon } from "lucide-react"

import {
  AddRelativeMenu,
  type AddAction,
  type AddActionKind,
} from "~/components/canvas/add-relative-menu"
import { RelativeForm } from "~/components/canvas/relative-form"
import { DeletePersonDialog } from "~/components/people/delete-person-dialog"
import { PersonAvatar } from "~/components/people/person-avatar"
import { PersonAttachmentsPanel } from "~/components/people/person-attachments-panel"
import { PersonPhotosPanel } from "~/components/people/person-photos-panel"
import { PersonForm, type PhotoAction } from "~/components/people/person-form"
import { NotesView } from "~/components/people/notes-view"
import { PlaceholderBadge } from "~/components/people/placeholder-badge"
import { PartialDateFields } from "~/components/people/partial-date-fields"
import { RemoveFromTreeDialog } from "~/components/trees/remove-from-tree-dialog"
import { Button } from "~/components/ui/button"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHandle,
  SheetHeader,
  SheetItem,
  SheetTitle,
} from "~/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  useCanvasUIStore,
  useSelectedNodeId,
} from "~/lib/canvas/canvas-ui-store"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveGenerationColor } from "~/lib/canvas/appearance-resolve"
import { resolveSelection } from "~/lib/canvas/resolve-selection"
import type { UnionNode } from "~/lib/graph/derive-unions"
import { personNodeId } from "~/lib/graph/node-ids"
import { updatePerson } from "~/lib/db/people"
import { removePersonPhoto, setPersonPhoto } from "~/lib/photos"
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
  updateRelationshipSubtype,
  type RelationshipDates,
} from "~/lib/db/relationship-actions"
import { removeRelationship } from "~/lib/db/relationships"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { Select } from "~/components/ui/select"
import { setMultipleBirthGroup } from "~/lib/db/multiple-birth"
import { SUBTYPE_OPTIONS } from "~/components/canvas/relative-form"
import { personDisplayName } from "~/lib/person-name"
import { formatPartialDate } from "~/lib/partial-date"
import type { PersonFormValues } from "~/lib/schemas"
import { toast } from "~/lib/ui/toast-store"
import type { ParentChildSubtype, Person, Relationship } from "~/lib/types"
import { coverPhotoId } from "~/lib/person-photos"
import { useIsCompact } from "~/lib/ui/viewport-tier"
import { cn } from "~/lib/utils"

type DetailTab = "details" | "family" | "media" | "notes"

// Photos and documents share one tab rather than taking one each: a fifth tab
// doesn't fit the panel's width, and the two are the same thing to the person
// looking for them — everything about this relative that isn't words.
const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "details", label: "Details" },
  { id: "family", label: "Family" },
  { id: "media", label: "Media" },
  { id: "notes", label: "Notes" },
]

interface DetailPanelProps {
  treeId: string
  people: Person[]
  relationships: Relationship[]
  unions: UnionNode[]
  generations: Map<string, number>
}

function personName(person: Person | undefined): string {
  return person ? personDisplayName(person) : "Unknown"
}

function lifeSpan(person: Person): string {
  const dates = [
    formatPartialDate(person.birth),
    formatPartialDate(person.death),
  ]
  if (!dates[0] && !dates[1]) return "Dates unknown"
  if (dates[0] && dates[1]) return `${dates[0]} – ${dates[1]}`
  return dates[0] ? `b. ${dates[0]}` : `d. ${dates[1]}`
}

export function DetailPanel({
  treeId,
  people,
  relationships,
  unions,
  generations,
}: DetailPanelProps) {
  const selectedNodeId = useSelectedNodeId()
  const selectedCount = useCanvasUIStore((s) => s.selectedNodeIds.length)
  const pendingMarriage = useCanvasUIStore((s) => s.pendingMarriage)
  const clearPendingMarriage = useCanvasUIStore((s) => s.clearPendingMarriage)
  const pendingAddRelative = useCanvasUIStore((s) => s.pendingAddRelative)
  const clearPendingAddRelative = useCanvasUIStore(
    (s) => s.clearPendingAddRelative
  )
  const pendingEditNodeId = useCanvasUIStore((s) => s.pendingEditNodeId)
  const clearPendingEdit = useCanvasUIStore((s) => s.clearPendingEdit)

  const compact = useIsCompact()

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people]
  )
  const selection = useMemo(
    () => resolveSelection(selectedNodeId, people, unions),
    [selectedNodeId, people, unions]
  )

  const [action, setAction] = useState<AddAction | undefined>(undefined)
  const [tab, setTab] = useState<DetailTab>("details")
  const [focusSignal, setFocusSignal] = useState(0)

  // A new selection always starts on Details with no add-relative sub-form.
  useEffect(() => {
    setAction(undefined)
    setTab("details")
  }, [selectedNodeId])

  // One-shot handoff from the canvas's Enter shortcut. "Edit" means putting the
  // cursor in the panel that is already showing this person, rather than
  // opening a second form on top of it.
  useEffect(() => {
    if (!pendingEditNodeId || pendingEditNodeId !== selectedNodeId) return
    setAction(undefined)
    setTab("details")
    setFocusSignal((n) => n + 1)
    clearPendingEdit()
  }, [pendingEditNodeId, selectedNodeId, clearPendingEdit])

  // One-shot handoff from an implicit union's "Record marriage" context menu.
  useEffect(() => {
    if (!pendingMarriage || selection?.kind !== "union") return
    const [pa, pb] = pendingMarriage.parents
    const [ua, ub] = selection.union.parents
    if (!((pa === ua && pb === ub) || (pa === ub && pb === ua))) return
    setAction({ kind: "add-spouse", mode: "record-marriage" })
    clearPendingMarriage()
  }, [pendingMarriage, selection, clearPendingMarriage])

  // One-shot handoff from the canvas quick-add buttons / node context menu.
  useEffect(() => {
    if (!pendingAddRelative || pendingAddRelative.nodeId !== selectedNodeId) {
      return
    }
    setAction({ kind: pendingAddRelative.kind, mode: "new" })
    setTab("family")
    clearPendingAddRelative()
  }, [pendingAddRelative, selectedNodeId, clearPendingAddRelative])

  // A multi-selection has no one person to describe. The bulk actions live in
  // the canvas panel, next to the cards they act on, so this only has to say
  // what is selected and how to get back to one person.
  if (selectedCount > 1) {
    return (
      <DetailContainer width="w-78">
        <div className="p-4">
          <p className="text-13 leading-relaxed text-muted-foreground">
            {selectedCount} cards selected. Use the bar at the top of the canvas
            to align them or change which trees they belong to. Tap any card on
            its own to go back to one person.
          </p>
        </div>
      </DetailContainer>
    )
  }

  if (!selection) {
    // Nothing to peek at, so on a compact screen there is no sheet at all —
    // the canvas gets the whole viewport until something is selected, which is
    // the entire point of moving the panel off the side.
    if (compact) return null
    return (
      <DetailContainer width="w-90">
        <div className="p-4">
          <p className="text-13 leading-relaxed text-muted-foreground">
            Select a person or a marriage dot on the canvas. Drag a card to pin
            it in place; right-click for more actions.
          </p>
          <p className="mt-3 text-13 leading-relaxed text-muted-foreground">
            With a person selected, the arrow keys step through their family the
            way the tree is drawn, <Key>Enter</Key> edits them, and <Key>P</Key>{" "}
            <Key>S</Key> <Key>C</Key> start a new parent, spouse or child.
          </p>
        </div>
      </DetailContainer>
    )
  }

  return (
    <DetailContainer width="w-90" scroll="hidden" key={selectedNodeId}>
      {selection.kind === "person" ? (
        <PersonDetail
          treeId={treeId}
          person={selection.person}
          people={peopleById}
          relationships={relationships}
          generation={generations.get(selection.person.id)}
          action={action}
          setAction={setAction}
          tab={tab}
          setTab={setTab}
          focusSignal={focusSignal}
        />
      ) : (
        <UnionDetail
          treeId={treeId}
          union={selection.union}
          people={peopleById}
          relationships={relationships}
          action={action}
          setAction={setAction}
        />
      )}
    </DetailContainer>
  )
}

// Peek height. Enough for the header, the action row and the tab strip — the
// three things a reader wants before deciding whether to open the whole record
// — and no more, so most of the canvas stays visible behind it.
const PEEK = "15rem"
const SNAP_POINTS = [PEEK, 1]

// Lets the panel's own contents raise the sheet to full height. A peek that
// only opens by dragging the handle is a trap when the gesture misfires, and
// every action inside it — tapping a tab, starting an edit — is a statement
// that the reader wants the whole record. A no-op on a wide screen, where the
// panel is a rail and there is nothing to expand.
const ExpandDetailSheet = createContext<() => void>(() => {})

function useExpandDetailSheet(): () => void {
  return useContext(ExpandDetailSheet)
}

// The same contents, in a rail on a wide screen and a bottom sheet on anything
// narrower. Below 1024px there is no room for a 360px rail beside a canvas, so
// the panel goes under it instead of beside it (ADR D37).
function DetailContainer({
  children,
  width,
  scroll = "auto",
}: {
  children: React.ReactNode
  width: "w-78" | "w-90"
  scroll?: "auto" | "hidden"
}) {
  const compact = useIsCompact()
  const select = useCanvasUIStore((s) => s.select)
  // Opens full every time, rather than at the peek or the last height: the
  // point of tapping a card is to read its record, not to drag a handle
  // first. A reader can still swipe down to the peek if they want the canvas
  // back.
  const [snap, setSnap] = useState<string | number | null>(1)
  const selectedNodeId = useSelectedNodeId()
  useEffect(() => setSnap(1), [selectedNodeId])
  const expand = useCallback(() => setSnap(1), [])

  if (!compact) {
    return (
      <aside
        data-print="hide"
        className={cn(
          "flex h-full shrink-0 flex-col border-l border-border",
          width,
          scroll === "auto" ? "overflow-y-auto" : "overflow-hidden"
        )}
      >
        {children}
      </aside>
    )
  }

  return (
    <Sheet
      open
      // Not modal: the canvas behind the peek stays pannable and tappable, so
      // a reader can walk the tree with the sheet up. A modal sheet would make
      // every step a close-then-reopen.
      modal={false}
      swipeDirection="down"
      snapPoints={SNAP_POINTS}
      snapPoint={snap}
      onSnapPointChange={setSnap}
      onOpenChange={(next) => {
        if (!next) select(null)
      }}
    >
      <SheetContent
        variant="snap"
        data-print="hide"
        // Focus stays on the canvas: selecting a card must not move the cursor
        // into the sheet, or every arrow-key step would need a tab back out.
        initialFocus={false}
      >
        <button
          type="button"
          aria-label="Expand details"
          className="flex flex-none cursor-grab touch-none justify-center pt-2.5 pb-1"
          onClick={() => setSnap(1)}
        >
          <SheetHandle />
        </button>
        <ExpandDetailSheet.Provider value={expand}>
          {children}
        </ExpandDetailSheet.Provider>
      </SheetContent>
    </Sheet>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="border border-border px-1 py-0.5 font-heading text-10 font-medium text-foreground">
      {children}
    </kbd>
  )
}

function GenerationChip({ generation }: { generation: number | undefined }) {
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )
  if (generation === undefined) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-2 rounded-xs"
        style={{
          background: resolveGenerationColor(generation, generationColors),
        }}
      />
      Gen {generation + 1}
    </span>
  )
}

interface PersonDetailProps {
  treeId: string
  person: Person
  people: Map<string, Person>
  relationships: Relationship[]
  generation: number | undefined
  action: AddAction | undefined
  setAction: (action: AddAction | undefined) => void
  tab: DetailTab
  setTab: (tab: DetailTab) => void
  focusSignal: number
}

function PersonDetail({
  treeId,
  person,
  people,
  relationships,
  generation,
  action,
  setAction,
  tab,
  setTab,
  focusSignal,
}: PersonDetailProps) {
  const select = useCanvasUIStore((s) => s.select)
  const compact = useIsCompact()
  const expandSheet = useExpandDetailSheet()
  const [overflowOpen, setOverflowOpen] = useState(false)
  // Bumping this remounts PersonForm, which is how "Revert" throws away
  // unsaved edits — the form owns its own field state.
  const [formKey, setFormKey] = useState(0)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Notes read as prose by default and edit on request. Leaving the textarea
  // permanently open would mean the [[links]] were never clickable, which is
  // the whole point of writing them.
  const [editingNotes, setEditingNotes] = useState(false)

  const parentRels = relationships.filter(
    (r) => r.type === "parent-child" && r.to === person.id
  )
  const childRels = relationships.filter(
    (r) => r.type === "parent-child" && r.from === person.id
  )
  const spouseRels = relationships.filter(
    (r) => r.type === "spouse" && (r.from === person.id || r.to === person.id)
  )

  async function handleUpdatePerson(
    values: PersonFormValues,
    photoAction: PhotoAction
  ) {
    await updatePerson(person.id, values)
    if (photoAction.kind === "staged") {
      await setPersonPhoto(person.id, photoAction.blob, photoAction.mime)
    } else if (photoAction.kind === "removed") {
      await removePersonPhoto(person.id)
    }
    toast("Changes saved")
  }

  // Shared between the desktop inline panel and the mobile full sheet, so the
  // submit handlers exist in exactly one place.
  const relativeForm = action && (
    <RelativeForm
      key={`${action.kind}:${action.mode}`}
      mode={action.mode}
      excludeIds={
        action.kind === "add-parent"
          ? [person.id, ...parentRels.map((r) => r.from)]
          : [person.id]
      }
      showDates={action.kind === "add-spouse"}
      // Every kind except a spouse: a marriage has no subtype to choose. A
      // sibling's subtype is their own link to the shared parents, which is
      // as ordinary a thing to record as a child's.
      showSubtype={action.kind !== "add-spouse"}
      onSubmitNew={async (values, dates, photoAction, subtype) => {
        let created: Person | undefined
        if (action.kind === "add-parent")
          created = await addParentNew(person.id, treeId, values, subtype)
        else if (action.kind === "add-spouse")
          created = await addSpouseNew(person.id, treeId, values, dates)
        else if (action.kind === "add-child")
          created = await addChildNew(
            { kind: "person", personId: person.id },
            treeId,
            values,
            subtype
          )
        else if (action.kind === "add-sibling")
          created = await addSiblingNew(person.id, treeId, values, subtype)
        if (created && photoAction.kind === "staged")
          await setPersonPhoto(created.id, photoAction.blob, photoAction.mime)
        setAction(undefined)
        toast("Relative added")
      }}
      onSubmitExisting={async (picked, dates, subtype) => {
        if (action.kind === "add-parent")
          await addParentExisting(person.id, treeId, picked.id, subtype)
        else if (action.kind === "add-spouse")
          await addSpouseExisting(person.id, treeId, picked.id, dates)
        else if (action.kind === "add-child")
          await addChildExisting(
            { kind: "person", personId: person.id },
            treeId,
            picked.id,
            subtype
          )
        else if (action.kind === "add-sibling")
          await addSiblingExisting(person.id, treeId, picked.id, subtype)
        setAction(undefined)
        toast("Relative linked")
      }}
      onCancel={() => setAction(undefined)}
    />
  )

  return (
    <>
      <div className="flex flex-none items-center gap-3 border-b border-border p-4 max-md:gap-3.5 max-md:py-3">
        <PersonAvatar photoId={coverPhotoId(person)} size="panel" />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-heading text-sm font-semibold max-md:text-15">
              {personName(person)}
            </h2>
            {person.isPlaceholder && <PlaceholderBadge />}
          </div>
          <span className="flex items-center gap-2 text-11 text-muted-foreground max-md:text-12-5">
            {lifeSpan(person)}
            <GenerationChip generation={generation} />
          </span>
        </div>
        {compact && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label="More actions"
              onClick={() => setOverflowOpen(true)}
            >
              <MoreHorizontal />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label="Close"
              onClick={() => select(null)}
            >
              <XIcon />
            </Button>
          </div>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as DetailTab)
          // Choosing a tab is asking to read it, and at the peek height a tab
          // panel is a two-pixel sliver.
          expandSheet()
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList>
          {TABS.map(({ id, label }) => (
            <TabsTrigger key={id} value={id}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          <TabsContent value="details">
            <PersonForm
              key={`${person.id}:${formKey}`}
              section="details"
              initialValues={person}
              focusSignal={focusSignal}
              onSubmit={handleUpdatePerson}
              onCancel={() => setFormKey((k) => k + 1)}
              cancelLabel="Revert"
              submitLabel="Save"
            />
          </TabsContent>

          <TabsContent value="media" className="flex flex-col gap-5">
            <PersonPhotosPanel person={person} />
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="font-heading text-10 font-semibold">Documents</h3>
              <PersonAttachmentsPanel personId={person.id} />
            </div>
          </TabsContent>

          <TabsContent value="notes">
            {editingNotes ? (
              <div className="flex flex-col gap-2">
                <PersonForm
                  key={`${person.id}:notes:${formKey}`}
                  section="notes"
                  initialValues={person}
                  onSubmit={async (values, photoAction) => {
                    await handleUpdatePerson(values, photoAction)
                    setEditingNotes(false)
                  }}
                  onCancel={() => setEditingNotes(false)}
                  submitLabel="Save notes"
                />
                <p className="text-11 leading-relaxed text-muted-foreground">
                  Write <code className="bg-muted px-1">[[Priya Iyer]]</code> to
                  link to someone.{" "}
                  <code className="bg-muted px-1">**bold**</code>,{" "}
                  <code className="bg-muted px-1">*italic*</code>,{" "}
                  <code className="bg-muted px-1"># headings</code> and{" "}
                  <code className="bg-muted px-1">- lists</code> also work.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <NotesView
                  notes={person.notes ?? ""}
                  people={[...people.values()]}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setEditingNotes(true)}
                >
                  {person.notes ? "Edit notes" : "Add notes"}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="family">
            {compact && (
              <MobileAddRelativeButtons
                parentCount={parentRels.length}
                givenName={person.givenName}
                onOpenAction={setAction}
              />
            )}
            <RelationshipList
              showSubtype
              title="Parents"
              relationships={parentRels}
              otherPersonId={(r) => r.from}
              people={people}
              onSelect={select}
            />
            <RelationshipList
              title="Spouses"
              relationships={spouseRels}
              otherPersonId={(r) => (r.from === person.id ? r.to : r.from)}
              people={people}
              onSelect={select}
              showDates
            />
            <RelationshipList
              showSubtype
              title="Children"
              relationships={childRels}
              otherPersonId={(r) => r.to}
              people={people}
              onSelect={select}
            />

            <MultipleBirthEditor
              person={person}
              relationships={relationships}
              people={people}
            />
          </TabsContent>

          {!compact && action && (
            <AddRelativePanel
              action={action}
              onModeChange={(mode) => setAction({ kind: action.kind, mode })}
              onCancel={() => setAction(undefined)}
            >
              {relativeForm}
            </AddRelativePanel>
          )}
        </div>
      </Tabs>

      {/* On mobile the form opens as its own full sheet rather than a div
          appended below the Family tab — the tap that opened it was a
          statement of intent, not a request to keep browsing the record
          behind a growing scroll. */}
      {compact && (
        <Sheet
          open={!!action}
          onOpenChange={(open) => {
            if (!open) setAction(undefined)
          }}
        >
          <SheetContent variant="full">
            {action && (
              <>
                <div className="flex h-14 flex-none items-center justify-between border-b border-border px-4">
                  <span className="truncate font-heading text-15 font-semibold">
                    {action.mode === "record-marriage"
                      ? "Record marriage"
                      : ADD_TITLES[action.kind]}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close"
                    onClick={() => setAction(undefined)}
                  >
                    <XIcon />
                  </Button>
                </div>
                <SheetBody className="pt-4">
                  {action.mode !== "record-marriage" && (
                    <AddRelativeModeToggle
                      mode={action.mode}
                      onChange={(mode) =>
                        setAction({ kind: action.kind, mode })
                      }
                    />
                  )}
                  <div className="pt-3">{relativeForm}</div>
                </SheetBody>
              </>
            )}
          </SheetContent>
        </Sheet>
      )}

      {!compact && (
        <div className="flex flex-none justify-between gap-2 border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRemoveOpen(true)}
          >
            Remove from tree
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>
      )}

      {compact && (
        <Sheet open={overflowOpen} onOpenChange={setOverflowOpen}>
          <SheetContent>
            <SheetHeader className="border-b border-border">
              <SheetTitle>{personName(person)}</SheetTitle>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-0.5 pt-2">
              <SheetItem
                label="Remove from this tree"
                detail="Stays in your people library"
                onClick={() => {
                  setOverflowOpen(false)
                  setRemoveOpen(true)
                }}
              />
              <SheetItem
                destructive
                label="Delete person"
                detail="From every tree. Cannot be undone"
                onClick={() => {
                  setOverflowOpen(false)
                  setDeleteOpen(true)
                }}
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}

      <RemoveFromTreeDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        person={person}
        treeId={treeId}
      />
      <DeletePersonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        person={person}
      />
    </>
  )
}

const ADD_TITLES: Record<AddActionKind, string> = {
  "add-parent": "Add parent",
  "add-spouse": "Add spouse",
  "add-child": "Add child",
  "add-sibling": "Add sibling",
}

// Wraps whichever RelativeForm is open with the New / Existing switch, so a
// quick-add started from the canvas (always "new") can still be pointed at
// somebody already in the pool without reopening the menu.
function AddRelativePanel({
  action,
  onModeChange,
  onCancel,
  children,
}: {
  action: AddAction
  onModeChange: (mode: "new" | "existing") => void
  onCancel: () => void
  children: React.ReactNode
}) {
  const isMarriage = action.mode === "record-marriage"

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <span className="font-heading text-10 font-semibold">
          {isMarriage ? "Record marriage" : ADD_TITLES[action.kind]}
        </span>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onCancel}>
          <XIcon />
          <span className="sr-only">Close</span>
        </Button>
      </div>
      {action.mode !== "record-marriage" && (
        <AddRelativeModeToggle mode={action.mode} onChange={onModeChange} />
      )}
      {children}
    </div>
  )
}

// Shared by the desktop inline panel and the mobile full sheet.
function AddRelativeModeToggle({
  mode,
  onChange,
}: {
  mode: "new" | "existing"
  onChange: (mode: "new" | "existing") => void
}) {
  return (
    <div className="flex gap-1.5">
      <Button
        variant={mode === "new" ? "default" : "outline"}
        size="xs"
        onClick={() => onChange("new")}
      >
        New person
      </Button>
      <Button
        variant={mode === "existing" ? "default" : "outline"}
        size="xs"
        onClick={() => onChange("existing")}
      >
        Existing
      </Button>
    </div>
  )
}

const MOBILE_ADD_RELATIVE_ACTIONS: Array<{
  kind: AddActionKind
  label: string
}> = [
  { kind: "add-spouse", label: "Add spouse" },
  { kind: "add-child", label: "Add child" },
  { kind: "add-parent", label: "Add parent" },
  { kind: "add-sibling", label: "Add sibling" },
]

// The Family tab's mobile counterpart to the canvas's own quick-add toolbar
// (person-node.tsx) — the same four actions, since there is no node toolbar
// to float under on a phone. Each one opens straight into the full sheet
// above, always starting on "new" the way the canvas quick-add does.
function MobileAddRelativeButtons({
  parentCount,
  givenName,
  onOpenAction,
}: {
  parentCount: number
  givenName: string
  onOpenAction: (action: AddAction) => void
}) {
  const parentsFull = parentCount >= 2

  return (
    <div className="flex flex-col gap-1.5 border-b pb-4">
      <p className="font-heading text-xs font-semibold text-muted-foreground">
        Add relative
      </p>
      <div className="flex flex-wrap gap-2">
        {MOBILE_ADD_RELATIVE_ACTIONS.map(({ kind, label }) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            disabled={kind === "add-parent" && parentsFull}
            onClick={() => onOpenAction({ kind, mode: "new" })}
          >
            {label}
          </Button>
        ))}
      </div>
      {parentsFull && (
        <p className="text-12-5 leading-snug text-muted-foreground">
          {givenName} already has two parents recorded. Remove one first.
        </p>
      )}
    </div>
  )
}

interface UnionDetailProps {
  treeId: string
  union: UnionNode
  people: Map<string, Person>
  relationships: Relationship[]
  action: AddAction | undefined
  setAction: (action: AddAction | undefined) => void
}

function UnionDetail({
  treeId,
  union,
  people,
  relationships,
  action,
  setAction,
}: UnionDetailProps) {
  const select = useCanvasUIStore((s) => s.select)
  const [a, b] = union.parents
  const nameA = personName(people.get(a))
  const nameB = personName(people.get(b))

  // A child "of this marriage" is one both parents point at.
  const childIds = useMemo(() => {
    const childrenOf = (parentId: string) =>
      new Set(
        relationships
          .filter((r) => r.type === "parent-child" && r.from === parentId)
          .map((r) => r.to)
      )
    const fromA = childrenOf(a)
    const fromB = childrenOf(b)
    return [...fromA].filter((id) => fromB.has(id))
  }, [relationships, a, b])

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-sm font-semibold">
          {nameA} &amp; {nameB}
        </h2>
        {union.kind === "real" ? (
          <UnionMarriageEditor union={union} />
        ) : (
          <p className="text-11 text-muted-foreground">
            Not yet recorded as married.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-9-5 font-semibold text-muted-foreground">
          Children of this marriage
        </p>
        <UnionChildren childIds={childIds} people={people} onSelect={select} />
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
        <AddRelativePanel
          action={action}
          onModeChange={(mode) => setAction({ kind: action.kind, mode })}
          onCancel={() => setAction(undefined)}
        >
          <RelativeForm
            key={`${action.kind}:${action.mode}`}
            mode={action.mode}
            excludeIds={union.parents}
            recordMarriageNames={[nameA, nameB]}
            onSubmitNew={async (values, _dates, photoAction) => {
              const created = await addChildNew(
                { kind: "union", parents: union.parents },
                treeId,
                values
              )
              if (photoAction.kind === "staged")
                await setPersonPhoto(
                  created.id,
                  photoAction.blob,
                  photoAction.mime
                )
              setAction(undefined)
              toast("Child added")
            }}
            onSubmitExisting={async (picked) => {
              await addChildExisting(
                { kind: "union", parents: union.parents },
                treeId,
                picked.id
              )
              setAction(undefined)
              toast("Child linked")
            }}
            onSubmitMarriage={async (dates) => {
              await recordMarriage(union.parents, dates)
              setAction(undefined)
              toast("Marriage recorded")
            }}
            onCancel={() => setAction(undefined)}
          />
        </AddRelativePanel>
      )}
    </div>
  )
}

function UnionChildren({
  childIds,
  people,
  onSelect,
}: {
  childIds: string[]
  people: Map<string, Person>
  onSelect: (nodeId: string) => void
}) {
  if (childIds.length === 0) {
    return <p className="text-xs text-muted-foreground">None recorded.</p>
  }

  return (
    <>
      {childIds.map((childId) => (
        <div
          key={childId}
          className="flex items-center gap-2 border border-border/60 px-2 py-1.5"
        >
          <PersonAvatar photoId={coverPhotoId(people.get(childId))} size="xs" />
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto p-0 text-xs tracking-normal normal-case"
            onClick={() => onSelect(personNodeId(childId))}
          >
            {personName(people.get(childId))}
          </Button>
        </div>
      ))}
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
        <p className="text-11 text-muted-foreground">
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
            onClick={() => {
              void removeRelationship(relationship.id)
              toast("Marriage removed")
            }}
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
  onSelect: (nodeId: string) => void
  showDates?: boolean
  showSubtype?: boolean
}

function RelationshipList({
  title,
  relationships,
  otherPersonId,
  people,
  onSelect,
  showDates = false,
  showSubtype = false,
}: RelationshipListProps) {
  const [editingId, setEditingId] = useState<string | undefined>(undefined)

  return (
    <div className="flex flex-col gap-1.5 border-b pb-4 not-first-of-type:mt-4">
      <p className="font-heading text-xs font-semibold text-muted-foreground">
        {title}
      </p>
      {relationships.length === 0 && (
        <p className="text-xs text-muted-foreground">None recorded.</p>
      )}
      {relationships.map((r) => {
        const otherId = otherPersonId(r)
        const other = people.get(otherId)
        const isEditing = editingId === r.id
        return (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-md border border-border/60 p-2"
          >
            <div className="flex items-center gap-2">
              <PersonAvatar photoId={coverPhotoId(other)} size="xs" />
              <div className="flex min-w-0 flex-col">
                <button
                  type="button"
                  className="mb-1 text-xs text-primary"
                  onClick={() => onSelect(personNodeId(otherId))}
                >
                  {personName(other)}
                </button>
                {showDates && (r.start || r.end) && (
                  <span className="text-11 text-muted-foreground">
                    {formatPartialDate(r.start)}
                    {r.end && ` – ${formatPartialDate(r.end)}`}
                  </span>
                )}
                {showSubtype && (
                  <SubtypeSelect
                    relationship={r}
                    onChanged={() => toast("Relationship updated")}
                  />
                )}
              </div>
              <div className="ml-auto flex gap-1">
                {showDates && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setEditingId(isEditing ? undefined : r.id)}
                  >
                    {isEditing ? "Cancel" : "Dates"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    void removeRelationship(r.id)
                    toast("Relationship removed")
                  }}
                >
                  Unlink
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

// Siblings are offered as checkboxes rather than asking for a group name,
// because a multiple birth is a relationship between specific people — the
// shared token is storage, not something a user should ever have to think
// about. Only full siblings-by-shared-parent are candidates, since anyone
// without a parent in common cannot have been born alongside this person.
function MultipleBirthEditor({
  person,
  relationships,
  people,
}: {
  person: Person
  relationships: Relationship[]
  people: Map<string, Person>
}) {
  const siblingIds = useMemo(() => {
    const parentIds = relationships
      .filter((r) => r.type === "parent-child" && r.to === person.id)
      .map((r) => r.from)
    if (parentIds.length === 0) return []
    const parents = new Set(parentIds)
    return [
      ...new Set(
        relationships
          .filter(
            (r) =>
              r.type === "parent-child" &&
              parents.has(r.from) &&
              r.to !== person.id
          )
          .map((r) => r.to)
      ),
    ]
  }, [relationships, person.id])

  if (siblingIds.length === 0) return null

  const group = person.multipleBirthGroup
  const inGroup = (id: string) =>
    !!group && people.get(id)?.multipleBirthGroup === group

  async function toggle(siblingId: string) {
    const current = siblingIds.filter(inGroup)
    const next = current.includes(siblingId)
      ? current.filter((id) => id !== siblingId)
      : [...current, siblingId]
    await setMultipleBirthGroup(person.id, next)
    toast(
      next.length > 0 ? "Multiple birth recorded" : "Multiple birth cleared"
    )
  }

  return (
    <div className="flex flex-col gap-1.5 border-b py-3">
      <p className="font-heading text-xs font-semibold text-muted-foreground">
        Born alongside
      </p>
      {siblingIds.map((siblingId) => (
        <Label key={siblingId} className="text-xs">
          <Checkbox
            checked={inGroup(siblingId)}
            onCheckedChange={() => void toggle(siblingId)}
          />
          {personName(people.get(siblingId))}
        </Label>
      ))}
    </div>
  )
}

// Editable in place rather than behind a toggle: unlike dates, this is a
// five-way choice with a default, and reading it is as useful as changing it —
// "how is this person related" is exactly what the Family tab is for.
function SubtypeSelect({
  relationship,
  onChanged,
}: {
  relationship: Relationship
  onChanged: () => void
}) {
  async function handleChange(value: string) {
    const subtype = value as ParentChildSubtype
    await updateRelationshipSubtype(
      relationship,
      subtype === "biological" ? undefined : subtype
    )
    onChanged()
  }

  return (
    <Select
      aria-label="How this parent-child link came about"
      value={relationship.subtype ?? "biological"}
      onChange={(e) => void handleChange(e.target.value)}
      className="h-6 py-0 text-xs md:text-xs"
    >
      {SUBTYPE_OPTIONS.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
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
