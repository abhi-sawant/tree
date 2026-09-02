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
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
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
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { useIsMobile } from "~/lib/ui/viewport-tier"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { Person, Relationship, Tree } from "~/lib/types"

interface TableViewProps {
  relationships: Relationship[]
  generations: Map<string, number>
  totalPeople: number
}

export function TableView({
  relationships,
  generations,
  totalPeople,
}: TableViewProps) {
  const [query, setQuery] = useState("")
  const [showPlaceholders, setShowPlaceholders] = useState(true)
  const [sort, setSort] = useState<PeopleSort>(DEFAULT_PEOPLE_SORT)
  const isMobile = useIsMobile()

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

  const setView = useAppShellStore((s) => s.setView)
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

  const sortedPeople = useMemo(
    () => (people ? sortPeople(people, sort, generations) : []),
    [people, sort, generations]
  )

  function openInTree(person: Person) {
    requestCenter(personNodeId(person.id))
    setView("tree")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5 max-md:gap-3 max-md:px-4 max-md:py-3">
      {/* Its own header on a phone: this is a bottom-bar destination, and the
          shell's topbar there belongs to the canvas. */}
      <div className="hidden items-center gap-2 max-md:flex">
        <div className="flex min-w-0 flex-col">
          <span className="font-heading text-lg font-semibold">People</span>
          <span className="text-11 text-muted-foreground">
            {sortedPeople.length} of {totalPeople}{" "}
            {totalPeople === 1 ? "person" : "people"}
          </span>
        </div>
        <Button
          size="icon-sm"
          aria-label="Add person"
          className="ml-auto"
          onClick={() => setFormTarget({})}
        >
          +
        </Button>
      </div>

      <div
        data-print="hide"
        className="flex items-center gap-4 max-md:flex-col max-md:items-stretch max-md:gap-2.5"
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-75 max-md:w-full"
        />
        <span className="text-xs text-muted-foreground max-md:hidden">
          {sortedPeople.length} of {totalPeople} people
        </span>
        <span className="text-xs text-muted-foreground max-md:hidden">
          Click a name or date to edit it in place
        </span>
        <Label className="ml-auto max-md:ml-0">
          <Checkbox
            checked={showPlaceholders}
            onCheckedChange={(checked) => setShowPlaceholders(checked === true)}
          />
          Show placeholders
        </Label>
      </div>

      {/* The list has no column headers to click, so the sort is stated as a
          row of its own. Shown only on a phone: on a wide screen the table's
          own headers carry it. */}
      <div className="hidden gap-1.5 max-md:flex" data-print="hide">
        {PEOPLE_SORTS.map(({ key, label }) => {
          const active = sort.key === key
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setSort(nextSort(sort, key))}
              className={cn(
                "flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-13 font-medium",
                active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground"
              )}
            >
              {label}
              {active && (sort.direction === "asc" ? "↑" : "↓")}
            </button>
          )
        })}
      </div>

      {isMobile ? (
        <PeopleList
          people={sortedPeople}
          treesByPersonId={treesByPersonId}
          generations={generations}
          relativeCounts={relativeCounts}
          onOpenInTree={openInTree}
          onEdit={(person) => setFormTarget({ person })}
          onDelete={setDeleteTarget}
          onAddToTree={setAddToTreeTarget}
          onRemoveFromTree={setRemoveFromTreeTarget}
          onMerge={setMergeTarget}
        />
      ) : (
        <PeopleTable
          people={sortedPeople}
          sort={sort}
          onSortChange={(key) => setSort(nextSort(sort, key))}
          treesByPersonId={treesByPersonId}
          generations={generations}
          relativeCounts={relativeCounts}
          onOpenInTree={openInTree}
          onEdit={(person) => setFormTarget({ person })}
          onDelete={setDeleteTarget}
          onAddToTree={setAddToTreeTarget}
          onRemoveFromTree={setRemoveFromTreeTarget}
          onMerge={setMergeTarget}
        />
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
              Search covers names, including maiden names and nicknames.
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
