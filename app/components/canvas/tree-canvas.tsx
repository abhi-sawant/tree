import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react"

import { PersonNode } from "~/components/canvas/person-node"
import { UnionNode } from "~/components/canvas/union-node"

const nodeTypes = { person: PersonNode, union: UnionNode }

interface TreeCanvasProps {
  nodes: Node[]
  edges: Edge[]
}

export function TreeCanvas({ nodes, edges }: TreeCanvasProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      fitView
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
