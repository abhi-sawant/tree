import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import { usePeople, usePerson } from "~/lib/db/hooks"
import type { Person, Relationship, TreeMember } from "~/lib/types"

afterEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.relationships.clear(),
    db.trees.clear(),
    db.members.clear(),
    db.photos.clear(),
  ])
})

function makePerson(overrides: Partial<Person> = {}): Person {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    givenName: "Ada",
    familyName: "Lovelace",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("FamilyTreeDB", () => {
  it("seeds a person and relationship and reads them back directly", async () => {
    const parent = makePerson({ givenName: "Ada" })
    const child = makePerson({ givenName: "Byron" })
    await db.people.bulkAdd([parent, child])

    const relationship: Relationship = {
      id: crypto.randomUUID(),
      type: "parent-child",
      from: parent.id,
      to: child.id,
    }
    await db.relationships.add(relationship)

    const storedParent = await db.people.get(parent.id)
    const storedRelationship = await db.relationships.get(relationship.id)

    expect(storedParent).toEqual(parent)
    expect(storedRelationship).toEqual(relationship)
  })

  it("reads a seeded person back through the liveQuery hooks", async () => {
    const person = makePerson()
    await db.people.add(person)

    const { result: singleResult } = renderHook(() => usePerson(person.id))
    await waitFor(() => expect(singleResult.current).toEqual(person))

    const { result: listResult } = renderHook(() => usePeople())
    await waitFor(() => expect(listResult.current).toEqual([person]))
  })

  it("enforces one membership row per (treeId, personId) via the compound key", async () => {
    const member: TreeMember = { treeId: "tree-1", personId: "person-1", x: 10, y: 20 }
    await db.members.put(member)
    await db.members.put({ ...member, x: 99, y: 99 })

    const rows = await db.members.where("treeId").equals("tree-1").toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ treeId: "tree-1", personId: "person-1", x: 99, y: 99 })
  })
})
