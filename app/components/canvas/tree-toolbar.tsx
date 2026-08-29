import { Panel } from "@xyflow/react"
import { FileDown, ImageDown, LayoutGrid } from "lucide-react"

import { Button } from "~/components/ui/button"
import { useTreeExport } from "~/components/canvas/use-tree-export"
import { clearAllPositions } from "~/lib/db/members"

interface TreeToolbarProps {
  treeId: string
  treeName: string
}

export function TreeToolbar({ treeId, treeName }: TreeToolbarProps) {
  const { exportPng, exportPdf } = useTreeExport(treeName)

  return (
    <Panel position="top-left">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void clearAllPositions(treeId)}
        >
          <LayoutGrid /> Re-layout tree
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportPng()}>
          <ImageDown /> Export PNG
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportPdf()}>
          <FileDown /> Export PDF
        </Button>
      </div>
    </Panel>
  )
}
