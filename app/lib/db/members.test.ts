import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  clearAllPositions,
  clearMemberPosition,
  setMemberPosition,
} from "~/lib/db/members"
import type { TreeMember } from "~/lib/types"

afterEach(async () => {
  await db.members.clear()
})

const id = () => crypto.randomUUID()

async function seedMember(overrides: Partial<TreeMember> = {}): Promise<TreeMember> {
  const member: TreeMember = { treeId: id(), personId: id(), ...overrides }
  await db.members.put(member)
  return member
}

describe("setMemberPosition", () => {
  it("persists x/y onto the member's row", async () => {
    const member = await seedMember()

    await setMemberPosition(member.treeId, member.personId, 42, 99)

    expect(await db.members.get([member.treeId, member.personId])).toEqual({
      ...member,
      x: 42,
      y: 99,
    })
  })
})

describe("clearMemberPosition", () => {
  it("clears only the targeted row's x/y, leaving a sibling row untouched", async () => {
    const treeId = id()
    const target = await seedMember({ treeId, x: 1, y: 2 })
    const sibling = await seedMember({ treeId, x: 3, y: 4 })

    await clearMemberPosition(target.treeId, target.personId)

    expect(await db.members.get([target.treeId, target.personId])).toEqual({
      treeId: target.treeId,
      personId: target.personId,
    })
    expect(await db.members.get([sibling.treeId, sibling.personId])).toEqual(
      sibling
    )
  })

  it("is a no-op when the member row doesn't exist", async () => {
    await expect(
      clearMemberPosition(id(), id())
    ).resolves.toBeUndefined()
  })
})

describe("clearAllPositions", () => {
  it("clears every member's x/y for the given tree, leaving other trees untouched", async () => {
    const treeId = id()
    const otherTreeId = id()
    const a = await seedMember({ treeId, x: 1, y: 1 })
    const b = await seedMember({ treeId, x: 2, y: 2 })
    const other = await seedMember({ treeId: otherTreeId, x: 9, y: 9 })

    await clearAllPositions(treeId)

    expect(await db.members.get([a.treeId, a.personId])).toEqual({
      treeId: a.treeId,
      personId: a.personId,
    })
    expect(await db.members.get([b.treeId, b.personId])).toEqual({
      treeId: b.treeId,
      personId: b.personId,
    })
    expect(await db.members.get([other.treeId, other.personId])).toEqual(other)
  })
})
