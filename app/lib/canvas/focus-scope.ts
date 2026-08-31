import type { Relationship } from "~/lib/types"

export type FocusMode = "ancestors" | "descendants" | "both"

export interface FocusScope {
  personId: string
  mode: FocusMode
  // Generations to walk away from the focus person. Infinity for the whole
  // lineage in that direction.
  generations: number
}

export const FOCUS_DEPTHS = [1, 2, 3, 4, Infinity] as const

export function focusDepthLabel(generations: number): string {
  return Number.isFinite(generations) ? `${generations} gen` : "All"
}

export function focusModeLabel(mode: FocusMode): string {
  if (mode === "ancestors") return "Ancestors"
  if (mode === "descendants") return "Descendants"
  return "Ancestors & descendants"
}

interface Adjacency {
  parents: Map<string, string[]>
  children: Map<string, string[]>
  spouses: Map<string, string[]>
}

function buildAdjacency(relationships: Relationship[]): Adjacency {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  const spouses = new Map<string, string[]>()

  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key) ?? []
    list.push(value)
    map.set(key, list)
  }

  for (const r of relationships) {
    if (r.type === "parent-child") {
      push(parents, r.to, r.from)
      push(children, r.from, r.to)
    } else {
      push(spouses, r.from, r.to)
      push(spouses, r.to, r.from)
    }
  }

  return { parents, children, spouses }
}

// Everyone a focus view should show: the focus person, their lineage in the
// chosen direction(s) up to `generations` steps, and the spouse of anyone
// included.
//
// Spouses are pulled in but never traversed through. Without them a couple
// would be split — one card rendered and their partner missing — which also
// strands the union node between them, since deriveUnions needs both parents
// present to produce one. Traversing *through* a spouse would instead drag in
// their whole separate family, which is not what "ancestors of X" means.
export function personIdsInFocus(
  relationships: Relationship[],
  focus: FocusScope
): Set<string> {
  const { parents, children, spouses } = buildAdjacency(relationships)
  const included = new Set<string>([focus.personId])

  const walk = (edges: Map<string, string[]>) => {
    let frontier = [focus.personId]
    let depth = 0
    while (frontier.length > 0 && depth < focus.generations) {
      const next: string[] = []
      for (const id of frontier) {
        for (const neighbour of edges.get(id) ?? []) {
          if (included.has(neighbour)) continue
          included.add(neighbour)
          next.push(neighbour)
        }
      }
      frontier = next
      depth++
    }
  }

  if (focus.mode === "ancestors" || focus.mode === "both") walk(parents)
  if (focus.mode === "descendants" || focus.mode === "both") walk(children)

  // Snapshot first: adding to `included` while iterating it would let a
  // spouse's own spouse creep in, walking sideways through remarriages.
  for (const id of [...included]) {
    for (const spouse of spouses.get(id) ?? []) included.add(spouse)
  }

  return included
}
