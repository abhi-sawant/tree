// Intentionally minimal: just enough to support Step 2's "add to tree" action.
// Rename, delete, root reassignment, and "remove from tree" are Step 7's job — don't add them here.

import { db } from "~/lib/db/db"
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
