// "Add whole family" — a spouse and any number of children recorded in one
// submit, as one transaction.
//
// The existing add-relative actions each write one link, which is the right
// shape for correcting a tree but the wrong one for building it: entering four
// children of a couple means eight separate form round-trips, and the couple
// has to be re-selected between each. SPEC §3.1 expects 30+ people in one
// sitting.

import { db } from "~/lib/db/db"
import { createPerson, type CreatePersonInput } from "~/lib/db/people"
import type { RelationshipDates } from "~/lib/db/relationship-actions"
import { addRelationship } from "~/lib/db/relationships"
import { addPersonToTree } from "~/lib/db/trees"
import type { ParentChildSubtype, Person } from "~/lib/types"

export type FamilySpouse =
  | { kind: "none" }
  | { kind: "new"; values: CreatePersonInput }
  | { kind: "existing"; personId: string }

export interface FamilyChild {
  values: CreatePersonInput
  subtype?: ParentChildSubtype
}

export interface AddFamilyInput {
  // The person the family is being recorded around — already in the tree.
  anchorPersonId: string
  treeId: string
  spouse: FamilySpouse
  marriage?: RelationshipDates
  children: FamilyChild[]
}

export interface AddFamilyResult {
  spouse?: Person
  children: Person[]
}

// Children are stamped one millisecond apart rather than all taking Date.now().
// orderFamilyGraph sorts a sibling row by createdAt and breaks ties on the id,
// which is a random UUID — so a batch created inside a single millisecond would
// render in an arbitrary order rather than the order they were typed in. Being
// able to enter children eldest-first is most of the point of this form.
const CHILD_STAMP_SPACING_MS = 1

export async function addFamily(
  input: AddFamilyInput,
  now: number = Date.now()
): Promise<AddFamilyResult> {
  const { anchorPersonId, treeId, spouse, marriage, children } = input

  return db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    async () => {
      const result: AddFamilyResult = { children: [] }

      let spouseId: string | undefined
      if (spouse.kind === "new") {
        const created = await createPerson(spouse.values, { createdAt: now })
        result.spouse = created
        spouseId = created.id
        await addRelationship({
          type: "spouse",
          from: anchorPersonId,
          to: spouseId,
          ...marriage,
        })
        await addPersonToTree(treeId, spouseId)
      } else if (spouse.kind === "existing") {
        spouseId = spouse.personId
        // The commonest case by far is picking somebody the anchor is already
        // married to and just adding children to that couple. Re-adding the
        // link would write a duplicate spouse row — the app has no notion of a
        // pair being married twice — so only record the marriage when there is
        // not already a link between them.
        const existingLinks = await db.relationships
          .where("from")
          .equals(anchorPersonId)
          .or("to")
          .equals(anchorPersonId)
          .toArray()
        const alreadyLinked = existingLinks.some(
          (r) => r.from === spouseId || r.to === spouseId
        )
        if (!alreadyLinked) {
          await addRelationship({
            type: "spouse",
            from: anchorPersonId,
            to: spouseId,
            ...marriage,
          })
        }
        await addPersonToTree(treeId, spouseId)
      }

      const parentIds = spouseId ? [anchorPersonId, spouseId] : [anchorPersonId]

      for (const [index, child] of children.entries()) {
        const created = await createPerson(child.values, {
          createdAt: now + (index + 1) * CHILD_STAMP_SPACING_MS,
        })
        for (const parentId of parentIds) {
          await addRelationship({
            type: "parent-child",
            from: parentId,
            to: created.id,
            subtype: child.subtype,
          })
        }
        await addPersonToTree(treeId, created.id)
        result.children.push(created)
      }

      return result
    }
  )
}
