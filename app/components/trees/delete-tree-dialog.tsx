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
  async function handleConfirm() {
    await deleteTree(tree.id)
    onOpenChange(false)
    onDeleted()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{tree.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the tree and its member list only — people and their
            relationships are untouched and remain in the pool. This can't be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
