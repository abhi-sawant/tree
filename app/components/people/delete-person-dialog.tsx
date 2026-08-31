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
import {
  deletePerson,
  getDeleteImpact,
  type DeleteImpact,
} from "~/lib/db/people"
import type { Person } from "~/lib/types"

interface DeletePersonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: Person
}

export function DeletePersonDialog({
  open,
  onOpenChange,
  person,
}: DeletePersonDialogProps) {
  const [impact, setImpact] = useState<DeleteImpact | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      setImpact(undefined)
      return
    }
    getDeleteImpact(person.id).then(setImpact)
  }, [open, person.id])

  const isBlocked = (impact?.blockingTrees.length ?? 0) > 0

  async function handleConfirm() {
    try {
      await deletePerson(person.id)
      onOpenChange(false)
    } catch {
      // The person became a root between the impact check and confirmation — refresh and show the block state.
      setImpact(await getDeleteImpact(person.id))
    }
  }

  const displayName = [person.givenName, person.familyName]
    .filter(Boolean)
    .join(" ")

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {isBlocked ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Can't delete {displayName}</AlertDialogTitle>
              <AlertDialogDescription>
                {displayName} is the root of trees:{" "}
                {impact?.blockingTrees.map((t) => t.name).join(", ")} — reassign
                root before deleting.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>OK</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {displayName}?</AlertDialogTitle>
              <AlertDialogDescription>
                {impact && impact.memberOfTrees.length > 0
                  ? `This removes them from: ${impact.memberOfTrees.map((t) => t.name).join(", ")}, along with all of their relationships and photo. This can't be undone.`
                  : "This removes all of their relationships and photo. This can't be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleConfirm}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
