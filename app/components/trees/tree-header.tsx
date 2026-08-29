import { ChevronDown, MoreHorizontal } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"

import { AddExistingPersonDialog } from "~/components/trees/add-existing-person-dialog"
import { ChangeRootDialog } from "~/components/trees/change-root-dialog"
import { CreateTreeDialog } from "~/components/trees/create-tree-dialog"
import { DeleteTreeDialog } from "~/components/trees/delete-tree-dialog"
import { RenameTreeDialog } from "~/components/trees/rename-tree-dialog"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { setLastTreeId } from "~/lib/last-tree"
import type { Tree } from "~/lib/types"

interface TreeHeaderProps {
  tree?: Tree
  trees: Tree[]
}

type DialogTarget =
  "create" | "rename" | "delete" | "change-root" | "add-existing" | undefined

export function TreeHeader({ tree, trees }: TreeHeaderProps) {
  const navigate = useNavigate()
  const [dialogTarget, setDialogTarget] = useState<DialogTarget>(undefined)

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm">
              {tree?.name ?? "Select a tree"}
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent>
          {trees.map((t) => (
            <DropdownMenuItem
              key={t.id}
              disabled={t.id === tree?.id}
              onClick={() => navigate(`/tree/${t.id}`)}
            >
              {t.name}
            </DropdownMenuItem>
          ))}
          {trees.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => setDialogTarget("create")}>
            New tree…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-center gap-2">
        {tree && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm">
                  <MoreHorizontal />
                  <span className="sr-only">Tree settings</span>
                </Button>
              }
            />
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setDialogTarget("rename")}>
                Rename tree
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialogTarget("change-root")}>
                Change root
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialogTarget("add-existing")}>
                Add existing person
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialogTarget("delete")}
              >
                Delete tree
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button variant="ghost" size="sm" render={<Link to="/people" />}>
          People
        </Button>
        <Button variant="ghost" size="sm" render={<Link to="/settings" />}>
          Settings
        </Button>
      </div>

      <CreateTreeDialog
        open={dialogTarget === "create"}
        onOpenChange={(open) => !open && setDialogTarget(undefined)}
        onCreated={(newTree) => {
          setDialogTarget(undefined)
          setLastTreeId(newTree.id)
          navigate(`/tree/${newTree.id}`)
        }}
      />

      {tree && (
        <>
          <RenameTreeDialog
            open={dialogTarget === "rename"}
            onOpenChange={(open) => !open && setDialogTarget(undefined)}
            tree={tree}
          />
          <ChangeRootDialog
            open={dialogTarget === "change-root"}
            onOpenChange={(open) => !open && setDialogTarget(undefined)}
            tree={tree}
          />
          <AddExistingPersonDialog
            open={dialogTarget === "add-existing"}
            onOpenChange={(open) => !open && setDialogTarget(undefined)}
            treeId={tree.id}
          />
          <DeleteTreeDialog
            open={dialogTarget === "delete"}
            onOpenChange={(open) => !open && setDialogTarget(undefined)}
            tree={tree}
            onDeleted={() => navigate("/")}
          />
        </>
      )}
    </header>
  )
}
