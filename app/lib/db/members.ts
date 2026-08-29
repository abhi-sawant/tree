// Position-override CRUD for TreeMember.x/y (Step 6). Layout recompute itself
// is automatic — tree.$id.tsx derives overriddenNodeIds reactively from
// useTreeMembers, so clearing/setting these fields is all that's needed here.

import { db } from "~/lib/db/db"

export async function setMemberPosition(
  treeId: string,
  personId: string,
  x: number,
  y: number
): Promise<void> {
  await db.members.update([treeId, personId], { x, y })
}

export async function clearMemberPosition(
  treeId: string,
  personId: string
): Promise<void> {
  const member = await db.members.get([treeId, personId])
  if (!member) return
  delete member.x
  delete member.y
  await db.members.put(member)
}

export async function clearAllPositions(treeId: string): Promise<void> {
  await db.members
    .where("treeId")
    .equals(treeId)
    .modify((member) => {
      delete member.x
      delete member.y
    })
}
