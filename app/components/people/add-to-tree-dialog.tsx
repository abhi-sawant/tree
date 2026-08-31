import { useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { useTrees, useTreesForPerson } from "~/lib/db/hooks"
import { addPersonToTree, createTree } from "~/lib/db/trees"
import type { Person } from "~/lib/types"

interface AddToTreeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: Person
}

export function AddToTreeDialog({
  open,
  onOpenChange,
  person,
}: AddToTreeDialogProps) {
  const trees = useTrees()
  const memberOfTrees = useTreesForPerson(person.id)
  const memberOfTreeIds = new Set(memberOfTrees?.map((t) => t.id))
  const [newTreeName, setNewTreeName] = useState("")

  async function handleAddExisting(treeId: string) {
    await addPersonToTree(treeId, person.id)
    onOpenChange(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTreeName.trim()) return
    await createTree({ name: newTreeName.trim(), rootPersonId: person.id })
    setNewTreeName("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to tree</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {trees && trees.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Existing trees</Label>
              {trees.map((tree) => {
                const alreadyMember = memberOfTreeIds.has(tree.id)
                return (
                  <Button
                    key={tree.id}
                    type="button"
                    variant="outline"
                    className="justify-start"
                    disabled={alreadyMember}
                    onClick={() => handleAddExisting(tree.id)}
                  >
                    {tree.name}
                    {alreadyMember && (
                      <span className="text-muted-foreground normal-case">
                        {" "}
                        (already added)
                      </span>
                    )}
                  </Button>
                )
              })}
            </div>
          )}

          <form onSubmit={handleCreate} className="flex flex-col gap-2">
            <Label htmlFor="new-tree-name">Create a new tree</Label>
            <div className="flex gap-2">
              <Input
                id="new-tree-name"
                value={newTreeName}
                onChange={(e) => setNewTreeName(e.target.value)}
                placeholder="Tree name"
              />
              <Button type="submit">Create</Button>
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
