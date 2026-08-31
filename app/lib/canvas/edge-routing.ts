// React Flow's own built-in edge type names, passed straight through as the
// edge's `type`. Constrained to the four that suit a family tree — no custom
// edge components, so nothing has to be registered with ReactFlow.
export type EdgeRouting = "smoothstep" | "step" | "straight" | "default"

export const EDGE_ROUTINGS: Array<{ value: EdgeRouting; label: string }> = [
  { value: "smoothstep", label: "Rounded steps" },
  { value: "step", label: "Square steps" },
  { value: "straight", label: "Straight" },
  { value: "default", label: "Curved" },
]

export function edgeRoutingLabel(routing: EdgeRouting): string {
  return (
    EDGE_ROUTINGS.find((option) => option.value === routing)?.label ?? routing
  )
}
