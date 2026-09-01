import { useMemo, useState } from "react"

import { AddToTreeDialog } from "~/components/people/add-to-tree-dialog"
import { DeletePersonDialog } from "~/components/people/delete-person-dialog"
import {
  PeopleTable,
  type RelativeCounts,
} from "~/components/people/people-table"
import { MergePeopleDialog } from "~/components/people/merge-people-dialog"
import { PersonFormDialog } from "~/components/people/person-form-dialog"
import { RemoveFromTreeDialog } from "~/components/trees/remove-from-tree-dialog"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useMembers, useSearchPeople, useTrees } from "~/lib/db/hooks"
import { personNodeId } from "~/lib/graph/node-ids"
import { comparePartialDate } from "~/lib/partial-date"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
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

  const [formTarget, setFormTarget] = useState<{ person?: Person } | undefined>(
    undefined
  )
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

  const sortedPeople = useMemo(() => {
    if (!people) return []
    return [...people].sort((a, b) => comparePartialDate(a.birth, b.birth))
  }, [people])

  function openInTree(person: Person) {
    requestCenter(personNodeId(person.id))
    setView("tree")
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
      <div className="flex items-center gap-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-75"
        />
        <span className="text-xs text-muted-foreground">
          {sortedPeople.length} of {totalPeople} people
        </span>
        <span className="text-xs text-muted-foreground">
          Click a name or date to edit it in place
        </span>
        <Label className="ml-auto">
          <Checkbox
            checked={showPlaceholders}
            onCheckedChange={(checked) => setShowPlaceholders(checked === true)}
          />
          Show placeholders
        </Label>
      </div>

      <PeopleTable
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

      {formTarget && (
        <PersonFormDialog
          open={!!formTarget}
          onOpenChange={(open) => !open && setFormTarget(undefined)}
          person={formTarget.person}
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
