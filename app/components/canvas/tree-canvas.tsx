import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type OnNodeDrag,
} from "@xyflow/react"

import { PersonNode } from "~/components/canvas/person-node"
import { TreeToolbar } from "~/components/canvas/tree-toolbar"
import { UnionNode } from "~/components/canvas/union-node"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { setMemberPosition } from "~/lib/db/members"
import { parseNodeId } from "~/lib/graph/node-ids"

const nodeTypes = { person: PersonNode, union: UnionNode }

interface TreeCanvasProps {
  treeId: string
  nodes: Node[]
  edges: Edge[]
}

export function TreeCanvas({ treeId, nodes, edges }: TreeCanvasProps) {
  const select = useCanvasUIStore((s) => s.select)

  const handleNodeDragStop: OnNodeDrag = (_event, node) => {
    const parsed = parseNodeId(node.id)
    if (parsed?.kind !== "person") return
    void setMemberPosition(treeId, parsed.personId, node.position.x, node.position.y)
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      onSelectionChange={({ nodes: selectedNodes }) =>
        select(selectedNodes[0]?.id ?? null)
      }
      onNodeDragStop={handleNodeDragStop}
      fitView
    >
      <Background />
      <Controls showInteractive={false} />
      <TreeToolbar treeId={treeId} />
    </ReactFlow>
  )
}
