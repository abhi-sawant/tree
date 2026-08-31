import { unionNodeId } from "~/lib/graph/node-ids"
import type { Relationship } from "~/lib/types"

export interface Bloodline {
  // People on the path, in order from the starting person to the root.
  personIds: string[]
  // Union dots the path runs through, since a child of two parents is drawn
  // parent -> union -> child rather than parent -> child.
  unionIds: string[]
}

// Traced over parent-child links in *both* directions, so the path still works
// when the tree's root is a descendant of the selected person, or a cousin
// reached by going up and then back down. A shortest path is what a reader
// wants: the most direct line of descent connecting the two.
//
// Spouse links are deliberately not traversed. A marriage is not a step in a
// bloodline, and allowing it would let the path hop between unrelated families.
export function bloodlineToRoot(
  relationships: Relationship[],
  fromPersonId: string,
  rootPersonId: string
): Bloodline | undefined {
  if (fromPersonId === rootPersonId) {
    return { personIds: [fromPersonId], unionIds: [] }
  }

  const neighbours = new Map<string, string[]>()
  const parentsOf = new Map<string, string[]>()
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key) ?? []
    list.push(value)
    map.set(key, list)
  }

  for (const r of relationships) {
    if (r.type !== "parent-child") continue
    push(neighbours, r.from, r.to)
    push(neighbours, r.to, r.from)
    push(parentsOf, r.to, r.from)
  }

  const cameFrom = new Map<string, string>()
  const seen = new Set<string>([fromPersonId])
  let frontier = [fromPersonId]
  let found = false

  while (frontier.length > 0 && !found) {
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbour of neighbours.get(id) ?? []) {
        if (seen.has(neighbour)) continue
        seen.add(neighbour)
        cameFrom.set(neighbour, id)
        if (neighbour === rootPersonId) {
          found = true
          break
        }
        next.push(neighbour)
      }
      if (found) break
    }
    frontier = next
  }

  if (!found) return undefined

  const personIds: string[] = []
  for (let id: string | undefined = rootPersonId; id; id = cameFrom.get(id)) {
    personIds.push(id)
  }
  personIds.reverse()

  // A step lands on a union whenever the child end of that step has two
  // recorded parents — that is exactly when the renderer inserts one.
  const unionIds: string[] = []
  for (let i = 0; i < personIds.length - 1; i++) {
    const [a, b] = [personIds[i], personIds[i + 1]]
    for (const child of [a, b]) {
      const parents = parentsOf.get(child) ?? []
      if (parents.length !== 2) continue
      if (!parents.includes(child === a ? b : a)) continue
      unionIds.push(unionNodeId([parents[0], parents[1]]))
    }
  }

  return { personIds, unionIds: [...new Set(unionIds)] }
}
