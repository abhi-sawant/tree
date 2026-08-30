import type { Person, Relationship } from "~/lib/types"

// Spouses are pinned to the same generation (a union-find over "spouse"
// relationships) before parent-child depth is computed — otherwise someone
// who married into the family one generation off from their partner (a
// remarriage, or a spouse whose own parents aren't in this tree) would drift
// to a different level than the family they visually sit beside.
export function computeGenerations(
  people: Person[],
  relationships: Relationship[]
): Map<string, number> {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    let root = id
    while (parent.has(root)) root = parent.get(root)!
    let cur = id
    while (parent.has(cur)) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  for (const p of people) find(p.id)
  for (const r of relationships) {
    if (r.type === "spouse") union(r.from, r.to)
  }

  const classParents = new Map<string, Set<string>>()
  for (const r of relationships) {
    if (r.type !== "parent-child") continue
    const childClass = find(r.to)
    const parentClass = find(r.from)
    if (childClass === parentClass) continue
    const set = classParents.get(childClass) ?? new Set<string>()
    set.add(parentClass)
    classParents.set(childClass, set)
  }

  const level = new Map<string, number>()
  const resolving = new Set<string>()
  const resolve = (classId: string): number => {
    const cached = level.get(classId)
    if (cached !== undefined) return cached
    // A cycle would only come from malformed data (addRelationship rejects
    // any parent-child write that would create one) — bail out at 0 rather
    // than recursing forever.
    if (resolving.has(classId)) return 0
    resolving.add(classId)
    const parentClasses = classParents.get(classId)
    const result = parentClasses
      ? Math.max(...[...parentClasses].map((p) => resolve(p) + 1))
      : 0
    resolving.delete(classId)
    level.set(classId, result)
    return result
  }

  const generations = new Map<string, number>()
  for (const p of people) {
    generations.set(p.id, resolve(find(p.id)))
  }
  return generations
}
