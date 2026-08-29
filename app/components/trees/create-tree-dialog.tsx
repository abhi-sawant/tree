import { useState } from "react"

import { PersonForm, type PhotoAction } from "~/components/people/person-form"
import { PersonPicker } from "~/components/people/person-picker"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { createPerson } from "~/lib/db/people"
import { createTree } from "~/lib/db/trees"
import { setPersonPhoto } from "~/lib/photos"
import type { PersonFormValues } from "~/lib/schemas"
import type { Person, Tree } from "~/lib/types"

interface CreateTreeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (tree: Tree) => void
}

type RootMode = "new" | "existing"

export function CreateTreeDialog({ open, onOpenChange, onCreated }: CreateTreeDialogProps) {
  const [name, setName] = useState("")
  const [mode, setMode] = useState<RootMode>("new")
  const [pickedRoot, setPickedRoot] = useState<Person | undefined>(undefined)

  async function handleCreateWithNewRoot(values: PersonFormValues, photoAction: PhotoAction) {
    if (!name.trim()) return
    const root = await createPerson(values)
    if (photoAction.kind === "staged") {
      await setPersonPhoto(root.id, photoAction.blob, photoAction.mime)
    }
    const tree = await createTree({ name: name.trim(), rootPersonId: root.id })
    reset()
    onCreated(tree)
  }

  async function handleCreateWithExistingRoot(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !pickedRoot) return
    const tree = await createTree({ name: name.trim(), rootPersonId: pickedRoot.id })
    reset()
    onCreated(tree)
  }

  function reset() {
    setName("")
    setMode("new")
    setPickedRoot(undefined)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a tree</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tree-name">Tree name</Label>
            <Input
              id="tree-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Sawant Family"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Root person</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "new" ? "default" : "outline"}
                onClick={() => setMode("new")}
              >
                New person
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "existing" ? "default" : "outline"}
                onClick={() => setMode("existing")}
              >
                Existing person
              </Button>
            </div>
          </div>

          {mode === "new" ? (
            <PersonForm
              onSubmit={handleCreateWithNewRoot}
              onCancel={() => onOpenChange(false)}
              submitLabel="Create tree"
            />
          ) : (
            <form onSubmit={handleCreateWithExistingRoot} className="flex flex-col gap-4">
              <PersonPicker onSelect={setPickedRoot} />
              {pickedRoot && (
                <p className="text-sm">
                  Selected:{" "}
                  {[pickedRoot.givenName, pickedRoot.familyName].filter(Boolean).join(" ")}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!pickedRoot || !name.trim()}>
                  Create tree
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
