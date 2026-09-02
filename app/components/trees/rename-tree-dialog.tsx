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
import { updateTreeName } from "~/lib/db/trees"
import type { Tree } from "~/lib/types"

interface RenameTreeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: Tree
}

export function RenameTreeDialog({
  open,
  onOpenChange,
  tree,
}: RenameTreeDialogProps) {
  const [name, setName] = useState(tree.name)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await updateTreeName(tree.id, name.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename tree</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tree-name">Tree name</Label>
            <Input
              id="tree-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tree name"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
