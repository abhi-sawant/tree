// Composites for the canvas's contextual add-relative actions (ADR.md D2/D10).
// Each wraps its writes in one Dexie transaction so a validation failure deep
// inside addRelationship (TooManyParentsError/RelationshipCycleError/
// SelfReferenceError) rolls back everything already done in the same call —
// e.g. a failed "add parent (new)" never leaves an orphaned new person with
// no relationship to anything.

import { db } from "~/lib/db/db"
import { createPerson, type CreatePersonInput } from "~/lib/db/people"
import {
  addRelationship,
  getParentIds,
  removeRelationship,
} from "~/lib/db/relationships"
import { addPersonToTree } from "~/lib/db/trees"
import type {
  ParentChildSubtype,
  PartialDate,
  Person,
  Relationship,
} from "~/lib/types"

export interface RelationshipDates {
  start?: PartialDate
  end?: PartialDate
}

export type AddChildTarget =
  | { kind: "person"; personId: string }
  | { kind: "union"; parents: [string, string] }

function targetParentIds(target: AddChildTarget): string[] {
  return target.kind === "union" ? target.parents : [target.personId]
}

export async function addParentNew(
  childId: string,
  treeId: string,
  parentInput: CreatePersonInput,
  subtype?: ParentChildSubtype
): Promise<Person> {
  return db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      const parent = await createPerson(parentInput)
      await addRelationship({
        type: "parent-child",
        from: parent.id,
        to: childId,
        subtype,
      })
      await addPersonToTree(treeId, parent.id)
      return parent
    }
  )
}

export async function addParentExisting(
  childId: string,
  treeId: string,
  parentId: string,
  subtype?: ParentChildSubtype
): Promise<void> {
  await db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      await addRelationship({
        type: "parent-child",
        from: parentId,
        to: childId,
        subtype,
      })
      await addPersonToTree(treeId, parentId)
    }
  )
}

export async function addSpouseNew(
  personId: string,
  treeId: string,
  spouseInput: CreatePersonInput,
  dates: RelationshipDates = {}
): Promise<Person> {
  return db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      const spouse = await createPerson(spouseInput)
      await addRelationship({
        type: "spouse",
        from: personId,
        to: spouse.id,
        ...dates,
      })
      await addPersonToTree(treeId, spouse.id)
      return spouse
    }
  )
}

export async function addSpouseExisting(
  personId: string,
  treeId: string,
  spouseId: string,
  dates: RelationshipDates = {}
): Promise<void> {
  await db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      await addRelationship({
        type: "spouse",
        from: personId,
        to: spouseId,
        ...dates,
      })
      await addPersonToTree(treeId, spouseId)
    }
  )
}

// Both people are already tree members by construction (they share a
// recorded child), so this is just the relationship write — no createPerson,
// no addPersonToTree. Once it lands, deriveUnions reclassifies the pair as
// kind:"real" on the very next recompute; there's no separate "promote" step.
export async function recordMarriage(
  parents: [string, string],
  dates: RelationshipDates = {}
): Promise<Relationship> {
  return addRelationship({
    type: "spouse",
    from: parents[0],
    to: parents[1],
    ...dates,
  })
}

export async function addChildNew(
  target: AddChildTarget,
  treeId: string,
  childInput: CreatePersonInput,
  subtype?: ParentChildSubtype
): Promise<Person> {
  return db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      const child = await createPerson(childInput)
      for (const parentId of targetParentIds(target)) {
        await addRelationship({
          type: "parent-child",
          from: parentId,
          to: child.id,
          subtype,
        })
      }
      await addPersonToTree(treeId, child.id)
      return child
    }
  )
}

export async function addChildExisting(
  target: AddChildTarget,
  treeId: string,
  childId: string,
  subtype?: ParentChildSubtype
): Promise<void> {
  await db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      for (const parentId of targetParentIds(target)) {
        await addRelationship({
          type: "parent-child",
          from: parentId,
          to: childId,
          subtype,
        })
      }
      await addPersonToTree(treeId, childId)
    }
  )
}

export interface EnsureParentsForSiblingResult {
  parentIds: string[]
  createdPlaceholder?: Person
}

// D5: "add sibling" with no recorded parents creates a placeholder parent
// automatically rather than blocking.
export async function ensureParentsForSibling(
  personId: string,
  treeId: string
): Promise<EnsureParentsForSiblingResult> {
  return db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      const parentIds = await getParentIds(personId)
      if (parentIds.length > 0) return { parentIds }

      const placeholder = await createPerson({
        givenName: "Unknown",
        isPlaceholder: true,
      })
      await addRelationship({
        type: "parent-child",
        from: placeholder.id,
        to: personId,
      })
      await addPersonToTree(treeId, placeholder.id)
      return { parentIds: [placeholder.id], createdPlaceholder: placeholder }
    }
  )
}

// The subtype describes the *new sibling's* link to the shared parents, not
// their relation to the person the add started from. Phase 1 offered it on
// parent and child adds only; a step-sibling or an adopted sibling is exactly
// as ordinary a thing to record, and without it the link had to be added and
// then corrected in the Family tab.
export async function addSiblingNew(
  personId: string,
  treeId: string,
  siblingInput: CreatePersonInput,
  subtype?: ParentChildSubtype
): Promise<Person> {
  return db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      const { parentIds } = await ensureParentsForSibling(personId, treeId)
      const sibling = await createPerson(siblingInput)
      for (const parentId of parentIds) {
        await addRelationship({
          type: "parent-child",
          from: parentId,
          to: sibling.id,
          subtype,
        })
      }
      await addPersonToTree(treeId, sibling.id)
      return sibling
    }
  )
}

export async function addSiblingExisting(
  personId: string,
  treeId: string,
  siblingId: string,
  subtype?: ParentChildSubtype
): Promise<void> {
  await db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      const { parentIds } = await ensureParentsForSibling(personId, treeId)
      for (const parentId of parentIds) {
        await addRelationship({
          type: "parent-child",
          from: parentId,
          to: siblingId,
          subtype,
        })
      }
      await addPersonToTree(treeId, siblingId)
    }
  )
}

// No updateRelationship exists by design (see relationships.ts) — editing is
// remove-then-add, wrapped in one transaction so a failed re-add doesn't
// leave the relationship deleted with nothing in its place.
export async function updateRelationshipDates(
  relationship: Relationship,
  dates: RelationshipDates
): Promise<Relationship> {
  return db.transaction("rw", db.relationships, async () => {
    await removeRelationship(relationship.id)
    return addRelationship({
      type: relationship.type,
      from: relationship.from,
      to: relationship.to,
      // Carried explicitly: this is a rebuild, not a patch, so any field left
      // off here is silently dropped — editing a marriage date must not reset
      // how the link came about.
      subtype: relationship.subtype,
      ...dates,
    })
  })
}

// Same remove-then-add shape as updateRelationshipDates, and for the same
// reason: relationships.ts deliberately has no update path.
export async function updateRelationshipSubtype(
  relationship: Relationship,
  subtype: ParentChildSubtype | undefined
): Promise<Relationship> {
  return db.transaction("rw", db.relationships, async () => {
    await removeRelationship(relationship.id)
    return addRelationship({
      type: relationship.type,
      from: relationship.from,
      to: relationship.to,
      start: relationship.start,
      end: relationship.end,
      subtype,
    })
  })
}
