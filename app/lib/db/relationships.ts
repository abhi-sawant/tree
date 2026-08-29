import { db } from "~/lib/db/db"
import { RelationshipFormSchema } from "~/lib/schemas"
import type { PartialDate, Relationship } from "~/lib/types"

export interface AddRelationshipInput {
  type: "parent-child" | "spouse"
  from: string
  to: string
  start?: PartialDate
  end?: PartialDate
}

export class SelfReferenceError extends Error {
  readonly personId: string

  constructor(personId: string) {
    super(`A person cannot have a relationship with themselves: ${personId}`)
    this.name = "SelfReferenceError"
    this.personId = personId
  }
}

export class TooManyParentsError extends Error {
  readonly childId: string
  readonly existingParentIds: string[]

  constructor(childId: string, existingParentIds: string[]) {
    super(`Person ${childId} already has ${existingParentIds.length} parents`)
    this.name = "TooManyParentsError"
    this.childId = childId
    this.existingParentIds = existingParentIds
  }
}

export class RelationshipCycleError extends Error {
  readonly from: string
  readonly to: string

  constructor(from: string, to: string) {
    super(`Adding parent-child ${from} -> ${to} would create a cycle`)
    this.name = "RelationshipCycleError"
    this.from = from
    this.to = to
  }
}

export async function getParentIds(childId: string): Promise<string[]> {
  const rows = await db.relationships.where("to").equals(childId).toArray()
  return rows.filter((r) => r.type === "parent-child").map((r) => r.from)
}

async function getChildIds(parentId: string): Promise<string[]> {
  const rows = await db.relationships.where("from").equals(parentId).toArray()
  return rows.filter((r) => r.type === "parent-child").map((r) => r.to)
}

async function isAncestor(target: string, start: string): Promise<boolean> {
  const seen = new Set<string>()
  let frontier = [start]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      const parents = await getParentIds(id)
      if (parents.includes(target)) return true
      next.push(...parents)
    }
    frontier = next
  }
  return false
}

async function isDescendant(target: string, start: string): Promise<boolean> {
  const seen = new Set<string>()
  let frontier = [start]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      const children = await getChildIds(id)
      if (children.includes(target)) return true
      next.push(...children)
    }
    frontier = next
  }
  return false
}

// A replacement/edit of a parent-child relationship is not a special case here:
// call removeRelationship(oldId) then addRelationship(newInput) — removing first
// frees a slot before the max-2-parents check below runs on the new insert.
export async function addRelationship(
  input: AddRelationshipInput
): Promise<Relationship> {
  const { type, from, to } = input
  if (from === to) throw new SelfReferenceError(from)

  if (type === "parent-child") {
    const existingParentIds = await getParentIds(to)
    if (existingParentIds.length >= 2)
      throw new TooManyParentsError(to, existingParentIds)

    const wouldCreateCycle =
      (await isAncestor(to, from)) || (await isDescendant(from, to))
    if (wouldCreateCycle) throw new RelationshipCycleError(from, to)
  }

  const relationship: Relationship = { id: crypto.randomUUID(), ...input }
  RelationshipFormSchema.parse(input)
  await db.relationships.add(relationship)
  return relationship
}

export async function removeRelationship(id: string): Promise<void> {
  await db.relationships.delete(id)
}
