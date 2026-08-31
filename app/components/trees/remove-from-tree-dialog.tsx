import { useEffect, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import { useTree, useTreesForPerson } from "~/lib/db/hooks"
import { PersonIsRootOfTreeError, removeMember } from "~/lib/db/trees"
import type { Person } from "~/lib/types"

interface RemoveFromTreeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: Person
  // Pre-scoped to one tree (canvas call site). Omit to show a tree picker
  // first (people-list call site, where the person may belong to N trees).
  treeId?: string
}

export function RemoveFromTreeDialog({
  open,
  onOpenChange,
  person,
  treeId,
}: RemoveFromTreeDialogProps) {
  const [chosenTreeId, setChosenTreeId] = useState<string | undefined>(treeId)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (open) {
      setChosenTreeId(treeId)
      setBlocked(false)
    }
  }, [open, treeId])

  const treesForPerson = useTreesForPerson(treeId ? undefined : person.id)
  // Skip the tree-picker step entirely when there's only one tree to choose
  // from — no need to make the user click through a single-option list.
  const effectiveTreeId =
    chosenTreeId ?? (treesForPerson?.length === 1 ? treesForPerson[0].id : undefined)
  const chosenTree = useTree(effectiveTreeId)

  const displayName = [person.givenName, person.familyName].filter(Boolean).join(" ")

  async function handleConfirm() {
    if (!effectiveTreeId) return
    try {
      await removeMember(effectiveTreeId, person.id)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof PersonIsRootOfTreeError) setBlocked(true)
      else throw err
    }
  }

  if (!effectiveTreeId) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from which tree?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose which tree to remove {displayName} from.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            {treesForPerson?.map((tree) => (
              <Button
                key={tree.id}
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => setChosenTreeId(tree.id)}
              >
                {tree.name}
              </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  const isBlocked = blocked || chosenTree?.rootPersonId === person.id

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {isBlocked ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Can't remove {displayName}</AlertDialogTitle>
              <AlertDialogDescription>
                {displayName} is the root of {chosenTree?.name ?? "this tree"} —
                reassign root before removing.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>OK</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {displayName}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes them from {chosenTree?.name ?? "this tree"} only —
                their record, relationships, and membership in other trees are
                untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleConfirm}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
