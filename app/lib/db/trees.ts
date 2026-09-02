import { db } from "~/lib/db/db"
import { getImmediateFamilyIds } from "~/lib/db/relationships"
import type { Tree } from "~/lib/types"

export interface CreateTreeInput {
  name: string
  rootPersonId: string
}

export async function createTree(input: CreateTreeInput): Promise<Tree> {
  const tree: Tree = {
    id: crypto.randomUUID(),
    name: input.name,
    rootPersonId: input.rootPersonId,
    createdAt: Date.now(),
  }

  await db.transaction("rw", db.trees, db.members, async () => {
    await db.trees.add(tree)
    await db.members.put({ treeId: tree.id, personId: input.rootPersonId })
  })

  return tree
}

// Idempotent: a no-op when the person is already a member, so it's safe to
// call unconditionally from every canvas add-relative action without
// clobbering a saved x/y position override on someone already in this tree.
export async function addPersonToTree(
  treeId: string,
  personId: string
): Promise<void> {
  const [tree, person] = await Promise.all([
    db.trees.get(treeId),
    db.people.get(personId),
  ])
  if (!tree) throw new Error(`Tree not found: ${treeId}`)
  if (!person) throw new Error(`Person not found: ${personId}`)

  const existing = await db.members.get([treeId, personId])
  if (!existing) await db.members.put({ treeId, personId })
}

export async function updateTreeName(
  treeId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Tree name cannot be empty")

  const tree = await db.trees.get(treeId)
  if (!tree) throw new Error(`Tree not found: ${treeId}`)

  await db.trees.update(treeId, { name: trimmed })
}

// D3/D4-style guard, scoped to one tree instead of global deletion: mirrors
// PersonIsRootError in app/lib/db/people.ts.
export class PersonIsRootOfTreeError extends Error {
  readonly personId: string
  readonly treeId: string
  readonly treeName: string

  constructor(personId: string, treeId: string, treeName: string) {
    super(`Cannot remove: person is the root of tree "${treeName}"`)
    this.name = "PersonIsRootOfTreeError"
    this.personId = personId
    this.treeId = treeId
    this.treeName = treeName
  }
}

// Removing from a tree never touches people/relationships — deleting this one
// TreeMember row is the entire operation. toElkGraph scopes purely off
// membership, so the canvas drops this person (and any edges touching them)
// on the next reactive re-render for free.
export async function removeMember(
  treeId: string,
  personId: string
): Promise<void> {
  const tree = await db.trees.get(treeId)
  if (!tree) throw new Error(`Tree not found: ${treeId}`)

  if (tree.rootPersonId === personId) {
    throw new PersonIsRootOfTreeError(personId, treeId, tree.name)
  }

  await db.members.delete([treeId, personId])
}

// Deletes the Tree row and all of its TreeMember rows only — people and
// relationships are global and untouched (SPEC §2.3). No root guard: removing
// the whole tree removes the root's membership along with everyone else's,
// so there's nothing left to guard against.
export async function deleteTree(treeId: string): Promise<void> {
  await db.transaction("rw", db.trees, db.members, async () => {
    await db.members.where("treeId").equals(treeId).delete()
    await db.trees.delete(treeId)
  })
}

// Root reassignment is limited to people already in the tree (D12: root is a
// layout anchor for that tree specifically) — add them as a member first via
// addPersonToTree/addExistingPersonToTree if they aren't already.
export async function reassignRoot(
  treeId: string,
  newRootPersonId: string
): Promise<void> {
  const tree = await db.trees.get(treeId)
  if (!tree) throw new Error(`Tree not found: ${treeId}`)

  const membership = await db.members.get([treeId, newRootPersonId])
  if (!membership) {
    throw new Error(
      `Person ${newRootPersonId} is not a member of tree ${treeId}`
    )
  }

  await db.trees.update(treeId, { rootPersonId: newRootPersonId })
}

export interface AddExistingPersonOptions {
  includeFamily?: boolean
}

export interface AddExistingPersonResult {
  addedIds: string[]
}

// D11: pulls in a person's immediate family (parents + spouses + children)
// alongside them, so an existing person doesn't render as a disconnected
// island in a tree whose relationships were all recorded elsewhere.
export async function addExistingPersonToTree(
  treeId: string,
  personId: string,
  options: AddExistingPersonOptions = {}
): Promise<AddExistingPersonResult> {
  return db.transaction(
    "rw",
    db.trees,
    db.people,
    db.members,
    db.relationships,
    async () => {
      const addedIds: string[] = []

      const alreadyMember = await db.members.get([treeId, personId])
      await addPersonToTree(treeId, personId)
      if (!alreadyMember) addedIds.push(personId)

      if (options.includeFamily) {
        const familyIds = await getImmediateFamilyIds(personId)
        for (const familyId of familyIds) {
          const existing = await db.members.get([treeId, familyId])
          await addPersonToTree(treeId, familyId)
          if (!existing) addedIds.push(familyId)
        }
      }

      return { addedIds }
    }
  )
}
