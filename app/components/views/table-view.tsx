import { useMemo, useState } from "react"

import { AddToTreeDialog } from "~/components/people/add-to-tree-dialog"
import { DeletePersonDialog } from "~/components/people/delete-person-dialog"
import {
  PeopleTable,
  type RelativeCounts,
} from "~/components/people/people-table"
import { MergePeopleDialog } from "~/components/people/merge-people-dialog"
import { PeopleList } from "~/components/people/people-list"
import { PersonFormDialog } from "~/components/people/person-form-dialog"
import { RemoveFromTreeDialog } from "~/components/trees/remove-from-tree-dialog"
import { Input } from "~/components/ui/input"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useMembers, useSearchPeople, useTrees } from "~/lib/db/hooks"
import { personNodeId } from "~/lib/graph/node-ids"
import {
  DEFAULT_PEOPLE_SORT,
  PEOPLE_SORTS,
  nextSort,
  sortPeople,
  type PeopleSort,
} from "~/lib/people/people-sort"
import { useSetView } from "~/lib/ui/use-shell-view"
import { useIsMobile } from "~/lib/ui/viewport-tier"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { GitMerge, LayoutGrid, List } from "lucide-react"
import { PeopleAlbum } from "~/components/people/people-album"
import { useAppearanceStore } from "~/lib/canvas/appearance-store"
import { resolveGenerationColor } from "~/lib/canvas/appearance-resolve"
import { computeColorIndices, surnameLegend } from "~/lib/canvas/color-groups"
import type { Person, Relationship, Tree } from "~/lib/types"

interface TableViewProps {
  rootPersonId?: string
  relationships: Relationship[]
  generations: Map<string, number>
  totalPeople: number
}

export function TableView({
  rootPersonId,
  relationships,
  generations,
  totalPeople,
}: TableViewProps) {
  const [query, setQuery] = useState("")
  const [showPlaceholders, setShowPlaceholders] = useState(true)
  const [sort, setSort] = useState<PeopleSort>(DEFAULT_PEOPLE_SORT)
  const [surname, setSurname] = useState<string | undefined>(undefined)
  const [layout, setLayout] = useState<"prints" | "list">("prints")
  const isMobile = useIsMobile()
  const colorBy = useAppearanceStore((s) => s.settings.colorBy)
  const generationColors = useAppearanceStore(
    (s) => s.settings.generationColors
  )

  const [formTarget, setFormTarget] = useState<
    { person?: Person; prefill?: string } | undefined
  >(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Person | undefined>(
    undefined
  )
  const [addToTreeTarget, setAddToTreeTarget] = useState<Person | undefined>(
    undefined
  )
  const [removeFromTreeTarget, setRemoveFromTreeTarget] = useState<
    Person | undefined
  >(undefined)
  const [mergeTarget, setMergeTarget] = useState<Person | undefined>(undefined)

  const setView = useSetView()
  const requestCenter = useCanvasUIStore((s) => s.requestCenter)

  const people = useSearchPeople(query, {
    includePlaceholders: showPlaceholders,
  })
  const trees = useTrees()
  const members = useMembers()

  const treesByPersonId = useMemo(() => {
    const map = new Map<string, Tree[]>()
    if (!trees || !members) return map

    const treesById = new Map(trees.map((tree) => [tree.id, tree]))
    for (const member of members) {
      const tree = treesById.get(member.treeId)
      if (!tree) continue
      const existing = map.get(member.personId) ?? []
      existing.push(tree)
      map.set(member.personId, existing)
    }
    return map
  }, [trees, members])

  const relativeCounts = useMemo(() => {
    const counts = new Map<string, RelativeCounts>()
    const bump = (id: string, key: "parents" | "spouses" | "children") => {
      const entry = counts.get(id) ?? { parents: 0, spouses: 0, children: 0 }
      entry[key] += 1
      counts.set(id, entry)
    }
    for (const r of relationships) {
      if (r.type === "parent-child") {
        bump(r.from, "children")
        bump(r.to, "parents")
      } else {
        bump(r.from, "spouses")
        bump(r.to, "spouses")
      }
    }
    return counts
  }, [relationships])

  const colorIndices = useMemo(
    () =>
      computeColorIndices({
        people: people ?? [],
        relationships,
        mode: colorBy,
        rootPersonId,
      }),
    [people, relationships, colorBy, rootPersonId]
  )

  const sortedPeople = useMemo(
    () => (people ? sortPeople(people, sort, generations) : []),
    [people, sort, generations]
  )

  function openInTree(person: Person) {
    requestCenter(personNodeId(person.id))
    setView("tree")
  }

  const chips = surnameLegend(people ?? [])
  const showSwatches = colorBy === "surname"
  const visible = surname
    ? sortedPeople.filter(
        (p) => (p.familyName ?? "").trim().toLowerCase() === surname
      )
    : sortedPeople

  const rowActions = {
    onOpenInTree: openInTree,
    onEdit: (person: Person) => setFormTarget({ person }),
    onDelete: setDeleteTarget,
    onAddToTree: setAddToTreeTarget,
    onRemoveFromTree: setRemoveFromTreeTarget,
    onMerge: setMergeTarget,
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-8 py-7 max-md:gap-4 max-md:px-4 max-md:py-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight max-md:text-3xl">
              People
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              {visible.length} of {totalPeople}{" "}
              {totalPeople === 1 ? "person" : "people"}
            </p>
          </div>
          <div
            data-print="hide"
            className="ml-auto flex items-center gap-2 max-md:w-full"
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, notes and details…"
              aria-label="Search people"
              className="w-80 max-md:flex-1"
            />
            <Button
              variant="outline"
              size="lg"
              className="max-md:hidden"
              onClick={() => setView("health")}
            >
              <GitMerge /> Find duplicates
            </Button>
            <Button
              size="icon-sm"
              aria-label="Add person"
              className="md:hidden"
              onClick={() => setFormTarget({})}
            >
              +
            </Button>
          </div>
        </div>

        <div
          data-print="hide"
          className="flex flex-wrap items-center gap-2 max-md:-mx-4 max-md:flex-nowrap max-md:gap-1.5 max-md:overflow-x-auto max-md:px-4 max-md:pb-1 max-md:[&>*]:flex-none"
        >
          <FilterChip
            pressed={!surname}
            onClick={() => setSurname(undefined)}
            count={people?.length ?? 0}
          >
            Everyone
          </FilterChip>
          {chips.map((chip) => (
            <FilterChip
              key={chip.label}
              pressed={surname === chip.label.toLowerCase()}
              onClick={() => setSurname(chip.label.toLowerCase())}
              count={chip.count}
              swatch={
                showSwatches
                  ? resolveGenerationColor(chip.index, generationColors)
                  : undefined
              }
            >
              {chip.label}
            </FilterChip>
          ))}
          <span className="mx-1 h-6 w-px bg-border max-md:hidden" aria-hidden />
          {PEOPLE_SORTS.map(({ key, label }) => {
            const active = sort.key === key
            return (
              <FilterChip
                key={key}
                pressed={active}
                onClick={() => setSort(nextSort(sort, key))}
              >
                {label}
                {active && (sort.direction === "asc" ? " ↑" : " ↓")}
              </FilterChip>
            )
          })}
          <FilterChip
            pressed={!showPlaceholders}
            onClick={() => setShowPlaceholders(!showPlaceholders)}
          >
            {showPlaceholders ? "Hide placeholders" : "Placeholders hidden"}
          </FilterChip>
          <div
            role="group"
            aria-label="View"
            className="ml-auto flex rounded-xl border-2 border-border bg-card p-0.5"
          >
            <ViewButton
              active={layout === "prints"}
              onClick={() => setLayout("prints")}
              icon={<LayoutGrid className="size-4" />}
            >
              Prints
            </ViewButton>
            <ViewButton
              active={layout === "list"}
              onClick={() => setLayout("list")}
              icon={<List className="size-4" />}
            >
              List
            </ViewButton>
          </div>
        </div>

        {layout === "prints" ? (
          <PeopleAlbum
            people={visible}
            colorOf={(person) =>
              resolveGenerationColor(
                colorIndices.get(person.id) ?? 0,
                generationColors
              )
            }
            {...rowActions}
          />
        ) : isMobile ? (
          <PeopleList
            people={visible}
            treesByPersonId={treesByPersonId}
            generations={generations}
            relativeCounts={relativeCounts}
            {...rowActions}
          />
        ) : (
          <>
            <p
              className="-mb-2 text-xs text-muted-foreground"
              data-print="hide"
            >
              Click a name or date to edit it in place
            </p>
            <PeopleTable
              people={visible}
              sort={sort}
              onSortChange={(key) => setSort(nextSort(sort, key))}
              treesByPersonId={treesByPersonId}
              generations={generations}
              relativeCounts={relativeCounts}
              {...rowActions}
            />
          </>
        )}

        {/* Nothing matched, so the useful thing to offer is making the person
          the reader was looking for. */}
        {sortedPeople.length === 0 && query.trim() && (
          <div className="flex flex-col items-start gap-3 py-6 max-md:py-4">
            <div className="flex flex-col gap-1">
              <p className="text-13 font-medium">
                No one matches &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="text-12-5 text-muted-foreground">
                Search covers names, notes and any details you have added.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFormTarget({ prefill: query.trim() })}
            >
              + Add &ldquo;{query.trim()}&rdquo;
            </Button>
          </div>
        )}
      </div>

      {formTarget && (
        <PersonFormDialog
          open={!!formTarget}
          onOpenChange={(open) => !open && setFormTarget(undefined)}
          person={formTarget.person}
          prefill={
            formTarget.prefill ? { givenName: formTarget.prefill } : undefined
          }
        />
      )}

      {deleteTarget && (
        <DeletePersonDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(undefined)}
          person={deleteTarget}
        />
      )}

      {addToTreeTarget && (
        <AddToTreeDialog
          open={!!addToTreeTarget}
          onOpenChange={(open) => !open && setAddToTreeTarget(undefined)}
          person={addToTreeTarget}
        />
      )}

      {removeFromTreeTarget && (
        <RemoveFromTreeDialog
          open={!!removeFromTreeTarget}
          onOpenChange={(open) => !open && setRemoveFromTreeTarget(undefined)}
          person={removeFromTreeTarget}
        />
      )}

      {mergeTarget && (
        <MergePeopleDialog
          open={!!mergeTarget}
          onOpenChange={(open) => !open && setMergeTarget(undefined)}
          person={mergeTarget}
          onMerged={() => setMergeTarget(undefined)}
        />
      )}
    </div>
  )
}

function FilterChip({
  pressed,
  onClick,
  count,
  swatch,
  children,
}: {
  pressed: boolean
  onClick: () => void
  count?: number
  swatch?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-9.5 cursor-pointer items-center gap-2 rounded-xl border-2 px-3.5 text-sm font-semibold transition-colors max-md:h-11",
        pressed
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground"
      )}
    >
      {swatch && (
        <span
          aria-hidden
          className="size-2.5 flex-none rounded-xs"
          style={{ background: swatch }}
        />
      )}
      {children}
      {count !== undefined && (
        <span className={pressed ? "opacity-70" : "text-muted-foreground"}>
          {count}
        </span>
      )}
    </button>
  )
}

function ViewButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8.5 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold max-md:h-10",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  )
}
