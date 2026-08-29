import { useMemo, useState } from "react"

import { AddToTreeDialog } from "~/components/people/add-to-tree-dialog"
import { DeletePersonDialog } from "~/components/people/delete-person-dialog"
import { PeopleTable } from "~/components/people/people-table"
import { PersonFormDialog } from "~/components/people/person-form-dialog"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { useMembers, useSearchPeople, useTrees } from "~/lib/db/hooks"
import { comparePartialDate } from "~/lib/partial-date"
import type { Person, Tree } from "~/lib/types"

export default function People() {
  const [query, setQuery] = useState("")
  const [showPlaceholders, setShowPlaceholders] = useState(true)

  const [formTarget, setFormTarget] = useState<{ person?: Person } | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Person | undefined>(undefined)
  const [addToTreeTarget, setAddToTreeTarget] = useState<Person | undefined>(undefined)

  const people = useSearchPeople(query, { includePlaceholders: showPlaceholders })
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

  const sortedPeople = useMemo(() => {
    if (!people) return []
    return [...people].sort((a, b) => comparePartialDate(a.birth, b.birth))
  }, [people])

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-lg font-semibold tracking-wider uppercase">People</h1>
        <Button onClick={() => setFormTarget({})}>Add person</Button>
      </div>

      <div className="flex items-center gap-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="max-w-sm"
        />
        <Label>
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
        onEdit={(person) => setFormTarget({ person })}
        onDelete={setDeleteTarget}
        onAddToTree={setAddToTreeTarget}
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
    </div>
  )
}
