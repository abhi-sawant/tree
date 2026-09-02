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
import { useTreeMembers } from "~/lib/db/hooks"
import { deleteTree } from "~/lib/db/trees"
import type { Tree } from "~/lib/types"

interface DeleteTreeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: Tree
  onDeleted: () => void
}

export function DeleteTreeDialog({
  open,
  onOpenChange,
  tree,
  onDeleted,
}: DeleteTreeDialogProps) {
  const members = useTreeMembers(tree.id)
  const memberCount = members?.length ?? 0

  async function handleConfirm() {
    await deleteTree(tree.id)
    onOpenChange(false)
    onDeleted()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this tree?</AlertDialogTitle>
          <AlertDialogDescription>
            "{tree.name}" and its {memberCount}{" "}
            {memberCount === 1 ? "membership" : "memberships"} are deleted. The
            people themselves stay in the pool, along with their relationships
            and photos. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm}>
            Delete tree
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
