export const PERSON_PREFIX = "person:"
export const UNION_PREFIX = "union:"

export function personNodeId(personId: string): string {
  return `${PERSON_PREFIX}${personId}`
}

// Sorted so the id is independent of which parent is passed first.
export function unionNodeId(parents: [string, string]): string {
  return `${UNION_PREFIX}${[...parents].sort().join(":")}`
}

export type ParsedNodeId =
  | { kind: "person"; personId: string }
  | { kind: "union"; parents: [string, string] }

export function parseNodeId(nodeId: string): ParsedNodeId | undefined {
  if (nodeId.startsWith(PERSON_PREFIX)) {
    return { kind: "person", personId: nodeId.slice(PERSON_PREFIX.length) }
  }
  if (nodeId.startsWith(UNION_PREFIX)) {
    const [a, b] = nodeId.slice(UNION_PREFIX.length).split(":")
    if (!a || !b) return undefined
    return { kind: "union", parents: [a, b] }
  }
  return undefined
}
