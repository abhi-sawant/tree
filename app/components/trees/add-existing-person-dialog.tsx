import { useEffect, useState } from "react"

import { PersonPicker } from "~/components/people/person-picker"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Label } from "~/components/ui/label"
import { useTreeMembers } from "~/lib/db/hooks"
import { getImmediateFamilyIds } from "~/lib/db/relationships"
import { addExistingPersonToTree } from "~/lib/db/trees"
import type { Person } from "~/lib/types"

interface AddExistingPersonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  treeId: string
}

export function AddExistingPersonDialog({
  open,
  onOpenChange,
  treeId,
}: AddExistingPersonDialogProps) {
  const members = useTreeMembers(treeId)
  const memberIds = new Set((members ?? []).map((m) => m.personId))

  const [picked, setPicked] = useState<Person | undefined>(undefined)
  const [newFamilyIds, setNewFamilyIds] = useState<string[]>([])
  const [includeFamily, setIncludeFamily] = useState(true)

  useEffect(() => {
    if (!open) {
      setPicked(undefined)
      setNewFamilyIds([])
      setIncludeFamily(true)
    }
  }, [open])

  useEffect(() => {
    if (!picked) {
      setNewFamilyIds([])
      return
    }
    let cancelled = false
    getImmediateFamilyIds(picked.id).then((ids) => {
      if (!cancelled) setNewFamilyIds(ids.filter((id) => !memberIds.has(id)))
    })
    return () => {
      cancelled = true
    }
    // Intentionally keyed only on `picked`: memberIds comes from a live query
    // and would otherwise re-run this on every unrelated membership change.
  }, [picked])

  async function handleSubmit() {
    if (!picked) return
    await addExistingPersonToTree(treeId, picked.id, { includeFamily })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add existing person</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <PersonPicker
            onSelect={setPicked}
            excludeIds={[...memberIds]}
            placeholder="Search for a person…"
          />

          {picked && (
            <>
              <p className="text-sm">
                Selected:{" "}
                {[picked.givenName, picked.familyName].filter(Boolean).join(" ")}
              </p>
              {newFamilyIds.length > 0 && (
                <Label>
                  <Checkbox
                    checked={includeFamily}
                    onCheckedChange={(checked) => setIncludeFamily(checked === true)}
                  />
                  Also add their immediate family — {newFamilyIds.length}{" "}
                  {newFamilyIds.length === 1 ? "person" : "people"}
                </Label>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!picked} onClick={handleSubmit}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
