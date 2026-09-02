import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"
import { usePeople, useTreeMembers } from "~/lib/db/hooks"
import { reassignRoot } from "~/lib/db/trees"
import type { Tree } from "~/lib/types"

interface ChangeRootDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: Tree
}

export function ChangeRootDialog({
  open,
  onOpenChange,
  tree,
}: ChangeRootDialogProps) {
  const members = useTreeMembers(tree.id)
  const people = usePeople()
  const peopleById = new Map((people ?? []).map((p) => [p.id, p]))

  const candidates = (members ?? [])
    .filter((m) => m.personId !== tree.rootPersonId)
    .map((m) => peopleById.get(m.personId))
    .filter((p) => p !== undefined)

  async function handlePick(personId: string) {
    await reassignRoot(tree.id, personId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change root</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No other members in this tree yet — add someone first.
            </p>
          )}
          {candidates.map((person) => (
            <Button
              key={person.id}
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => handlePick(person.id)}
            >
              {[person.givenName, person.familyName].filter(Boolean).join(" ")}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
