import { db } from "~/lib/db/db"
import { updatePerson, type UpdatePersonInput } from "~/lib/db/people"
import type { Person, Relationship } from "~/lib/types"

export class SelfMergeError extends Error {
  constructor(readonly personId: string) {
    super("A person cannot be merged with themselves")
    this.name = "SelfMergeError"
  }
}

// The two are recorded as related to each other, so the record itself says they
// are different people. Refusing is safer than silently dropping the
// relationship: if the relationship is the mistake, the user should remove it
// deliberately, where they can see what they are removing.
export class RelatedPeopleMergeError extends Error {
  constructor(
    readonly winnerId: string,
    readonly loserId: string,
    readonly relationshipType: Relationship["type"]
  ) {
    super("Cannot merge two people who are recorded as related to each other")
    this.name = "RelatedPeopleMergeError"
  }
}

// D7 caps a child at two parents. If both records name two *different* parents,
// the merged child would have four, and deriveUnions silently ignores anyone
// with more than two — the child would vanish from the canvas. Capping instead
// would throw away real relationships without saying so, so the merge stops and
// names the conflict: merging the duplicate parents first resolves it.
export class TooManyParentsAfterMergeError extends Error {
  constructor(
    readonly childId: string,
    readonly parentIds: string[]
  ) {
    super(
      `Merging would leave one child with ${parentIds.length} parents, and only 2 are allowed`
    )
    this.name = "TooManyParentsAfterMergeError"
  }
}

export interface MergePeopleInput {
  // The record that survives, and whose id every relationship ends up pointing
  // at.
  winnerId: string
  loserId: string
  // Field values already settled by the review UI. Only the keys present are
  // applied, so an untouched field keeps the winner's value.
  resolved?: UpdatePersonInput
}

export interface MergeResult {
  winner: Person
  // Relationships whose endpoint moved from the loser to the winner.
  movedRelationships: number
  // Relationships dropped because the winner already had the identical link.
  dedupedRelationships: number
  treesJoined: number
  rootsReassigned: number
  adoptedPhoto: boolean
}

// A link's identity for dedupe purposes: same type, same other person, same
// direction. Dates and subtype are deliberately excluded — two records of the
// same marriage where one has a date and the other doesn't are still one
// marriage, and keeping both would draw the couple twice.
function linkKey(relationship: Relationship, selfId: string): string {
  const isFrom = relationship.from === selfId
  const other = isFrom ? relationship.to : relationship.from
  return `${relationship.type}:${isFrom ? "from" : "to"}:${other}`
}

// Prefers whichever version of a duplicated link carries more information, so
// merging never loses a marriage date that only the discarded record had.
function informationScore(relationship: Relationship): number {
  return (
    (relationship.start ? 1 : 0) +
    (relationship.end ? 1 : 0) +
    (relationship.subtype && relationship.subtype !== "biological" ? 1 : 0)
  )
}

// Folds one person's record into another: relationships re-pointed, tree
// memberships and photo adopted, then the loser deleted.
//
// Everything happens in a single Dexie transaction, so a guard tripping partway
// through leaves the data exactly as it was. That matters more here than
// anywhere else in the app: a half-applied merge would leave relationships
// pointing at a person who no longer exists.
export async function mergePeople({
  winnerId,
  loserId,
  resolved,
}: MergePeopleInput): Promise<MergeResult> {
  if (winnerId === loserId) throw new SelfMergeError(winnerId)

  return db.transaction(
    "rw",
    db.people,
    db.relationships,
    db.members,
    db.trees,
    db.photos,
    async () => {
      const [winner, loser] = await Promise.all([
        db.people.get(winnerId),
        db.people.get(loserId),
      ])
      if (!winner) throw new Error(`Person not found: ${winnerId}`)
      if (!loser) throw new Error(`Person not found: ${loserId}`)

      const all = await db.relationships.toArray()
      const between = all.find(
        (r) =>
          (r.from === winnerId && r.to === loserId) ||
          (r.from === loserId && r.to === winnerId)
      )
      if (between) {
        throw new RelatedPeopleMergeError(winnerId, loserId, between.type)
      }

      const winnerLinks = all.filter(
        (r) => r.from === winnerId || r.to === winnerId
      )
      const loserLinks = all.filter(
        (r) => r.from === loserId || r.to === loserId
      )

      // Parent counts have to be checked before anything is written, across
      // every child either record parents.
      const parentsByChild = new Map<string, Set<string>>()
      for (const r of all) {
        if (r.type !== "parent-child") continue
        const parent = r.from === loserId ? winnerId : r.from
        const set = parentsByChild.get(r.to) ?? new Set<string>()
        set.add(parent)
        parentsByChild.set(r.to, set)
      }
      for (const [childId, parents] of parentsByChild) {
        if (childId === loserId) continue // the loser is about to be deleted
        if (parents.size > 2) {
          throw new TooManyParentsAfterMergeError(childId, [...parents])
        }
      }

      // Keep the richer of any duplicated link, and count what goes.
      const keptByKey = new Map<string, Relationship>()
      for (const r of winnerLinks) keptByKey.set(linkKey(r, winnerId), r)

      let moved = 0
      let deduped = 0
      for (const r of loserLinks) {
        const key = linkKey(r, loserId)
        const existing = keptByKey.get(key)
        if (!existing) {
          await db.relationships.update(r.id, {
            from: r.from === loserId ? winnerId : r.from,
            to: r.to === loserId ? winnerId : r.to,
          })
          moved++
          continue
        }
        if (informationScore(r) > informationScore(existing)) {
          // The loser's copy knows more, so it takes over the winner's slot.
          await db.relationships.delete(existing.id)
          await db.relationships.update(r.id, {
            from: r.from === loserId ? winnerId : r.from,
            to: r.to === loserId ? winnerId : r.to,
          })
          keptByKey.set(key, r)
          moved++
        } else {
          await db.relationships.delete(r.id)
        }
        deduped++
      }

      // Memberships are a union. The winner's own position override wins where
      // it exists; otherwise the loser's is adopted, so a card the user had
      // placed by hand doesn't jump back to auto-layout.
      const loserMemberships = await db.members
        .where("personId")
        .equals(loserId)
        .toArray()
      let treesJoined = 0
      for (const membership of loserMemberships) {
        const existing = await db.members.get([membership.treeId, winnerId])
        if (!existing) {
          await db.members.put({
            treeId: membership.treeId,
            personId: winnerId,
            x: membership.x,
            y: membership.y,
          })
          treesJoined++
        } else if (existing.x === undefined && membership.x !== undefined) {
          await db.members.put({
            ...existing,
            x: membership.x,
            y: membership.y,
          })
        }
        await db.members.delete([membership.treeId, loserId])
      }

      // Unlike deletePerson, which refuses to touch a root, a merge re-points
      // it: the person still exists, under the surviving id.
      const rootTrees = await db.trees
        .where("rootPersonId")
        .equals(loserId)
        .toArray()
      for (const tree of rootTrees) {
        await db.trees.update(tree.id, { rootPersonId: winnerId })
      }

      const adoptedPhoto = !winner.photoId && !!loser.photoId
      const patch: UpdatePersonInput = { ...resolved }
      if (adoptedPhoto) patch.photoId = loser.photoId
      if (!winner.multipleBirthGroup && loser.multipleBirthGroup) {
        patch.multipleBirthGroup = loser.multipleBirthGroup
      }

      const updated = await updatePerson(winnerId, patch)

      // Only delete the loser's photo if the winner didn't just adopt it.
      if (loser.photoId && !adoptedPhoto) {
        await db.photos.delete(loser.photoId)
      }
      await db.people.delete(loserId)

      return {
        winner: updated,
        movedRelationships: moved,
        dedupedRelationships: deduped,
        treesJoined,
        rootsReassigned: rootTrees.length,
        adoptedPhoto,
      }
    }
  )
}
