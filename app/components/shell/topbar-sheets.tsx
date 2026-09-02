import { Check } from "lucide-react"

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetItem,
  SheetTitle,
} from "~/components/ui/sheet"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { useMembers } from "~/lib/db/hooks"
import { useRedaction } from "~/lib/export/use-redaction"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import type { ExportAction } from "~/components/shell/export-actions"
import type { Person, Tree } from "~/lib/types"

// The two things the desktop topbar says inline that a 390px topbar cannot:
// which tree is open (and the operations on it), and what can be exported.
// Both become sheets rather than menus — a dropdown anchored to a 44px button
// on a phone opens where the thumb already is.

interface TreeSwitcherSheetProps {
  tree: Tree
  trees: Tree[]
  people: Person[]
  onRename: () => void
  onChangeRoot: () => void
  onAddExisting: () => void
  onCreateTree: () => void
  onDelete: () => void
}

export function TreeSwitcherSheet({
  tree,
  trees,
  people,
  onRename,
  onChangeRoot,
  onAddExisting,
  onCreateTree,
  onDelete,
}: TreeSwitcherSheetProps) {
  const open = useAppShellStore((s) => s.mobileSheet === "tree-switcher")
  const setMobileSheet = useAppShellStore((s) => s.setMobileSheet)
  const setActiveTree = useAppShellStore((s) => s.setActiveTree)
  const setView = useAppShellStore((s) => s.setView)
  const members = useMembers()

  const close = () => setMobileSheet(null)
  const describe = (candidate: Tree) => {
    const count = (members ?? []).filter(
      (m) => m.treeId === candidate.id
    ).length
    const root = people.find((p) => p.id === candidate.rootPersonId)
    const rootName = root
      ? [root.givenName, root.familyName].filter(Boolean).join(" ")
      : "no root"
    return `${count} ${count === 1 ? "person" : "people"} · root ${rootName}`
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent>
        <SheetHeader className="border-b border-border">
          <SheetTitle>Switch tree</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-0.5 pt-2">
          {trees.map((candidate) => (
            <SheetItem
              key={candidate.id}
              label={candidate.name}
              detail={describe(candidate)}
              selected={candidate.id === tree.id}
              trailing={
                candidate.id === tree.id ? (
                  <Check className="size-4 text-primary" />
                ) : undefined
              }
              onClick={() => {
                setActiveTree(candidate.id)
                setView("tree")
              }}
            />
          ))}
          <div className="my-2 h-px bg-border" />
          <SheetItem
            label="Rename this tree"
            onClick={() => {
              close()
              onRename()
            }}
          />
          <SheetItem
            label="Change root person"
            onClick={() => {
              close()
              onChangeRoot()
            }}
          />
          <SheetItem
            label="Add existing person"
            onClick={() => {
              close()
              onAddExisting()
            }}
          />
          <SheetItem
            label="New tree"
            onClick={() => {
              close()
              onCreateTree()
            }}
          />
          <div className="my-2 h-px bg-border" />
          <SheetItem
            destructive
            label="Delete this tree"
            onClick={() => {
              close()
              onDelete()
            }}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

export function ExportSheet({ actions }: { actions: ExportAction[] }) {
  const open = useAppShellStore((s) => s.mobileSheet === "export")
  const setMobileSheet = useAppShellStore((s) => s.setMobileSheet)
  const { redactLiving, setRedactLiving, presumedLivingCount } = useRedaction()

  return (
    <Sheet open={open} onOpenChange={(next) => !next && setMobileSheet(null)}>
      <SheetContent>
        <SheetHeader className="border-b border-border">
          <SheetTitle>Export</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-0.5 pt-2">
          {actions.map((action) => (
            <SheetItem
              key={action.id}
              label={action.label}
              detail={action.detail}
              disabled={action.disabled}
              trailing="›"
              onClick={() => {
                setMobileSheet(null)
                action.run()
              }}
            />
          ))}

          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border p-3.5">
            <p className="font-heading text-11 font-semibold text-muted-foreground">
              Before sharing
            </p>
            <Label className="flex-row items-center gap-2.5 text-sm font-normal normal-case">
              <Checkbox
                checked={redactLiving}
                onCheckedChange={(checked) => setRedactLiving(checked === true)}
              />
              Hide details of living people
            </Label>
            <p className="text-12-5 leading-snug text-muted-foreground">
              {presumedLivingCount === 0
                ? "Everyone recorded has a death date or was born long enough ago to presume one."
                : `${presumedLivingCount} ${presumedLivingCount === 1 ? "person" : "people"} with no recorded death would appear as “Living” with no dates. The canvas shows exactly what will be exported.`}
            </p>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
