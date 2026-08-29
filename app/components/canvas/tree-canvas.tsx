import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react"

import { PersonNode } from "~/components/canvas/person-node"
import { UnionNode } from "~/components/canvas/union-node"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"

const nodeTypes = { person: PersonNode, union: UnionNode }

interface TreeCanvasProps {
  nodes: Node[]
  edges: Edge[]
}

export function TreeCanvas({ nodes, edges }: TreeCanvasProps) {
  const select = useCanvasUIStore((s) => s.select)

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onSelectionChange={({ nodes: selectedNodes }) =>
        select(selectedNodes[0]?.id ?? null)
      }
      fitView
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
