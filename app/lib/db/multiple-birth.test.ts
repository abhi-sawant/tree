import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import { setMultipleBirthGroup } from "~/lib/db/multiple-birth"
import { createPerson } from "~/lib/db/people"

afterEach(async () => {
  await db.people.clear()
})

async function tokens(ids: string[]) {
  const people = await db.people.bulkGet(ids)
  return people.map((p) => p?.multipleBirthGroup)
}

describe("setMultipleBirthGroup", () => {
  it("gives everyone in the group the same token", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })

    await setMultipleBirthGroup(a.id, [b.id])

    const [tokenA, tokenB] = await tokens([a.id, b.id])
    expect(tokenA).toBeDefined()
    expect(tokenB).toBe(tokenA)
  })

  it("records a group of three from one member", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })
    const c = await createPerson({ givenName: "C" })

    await setMultipleBirthGroup(a.id, [b.id, c.id])

    const all = await tokens([a.id, b.id, c.id])
    expect(new Set(all).size).toBe(1)
    expect(all[0]).toBeDefined()
  })

  it("drops one triplet while leaving the other two grouped", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })
    const c = await createPerson({ givenName: "C" })
    await setMultipleBirthGroup(a.id, [b.id, c.id])

    await setMultipleBirthGroup(a.id, [b.id])

    const [tokenA, tokenB, tokenC] = await tokens([a.id, b.id, c.id])
    expect(tokenA).toBeDefined()
    expect(tokenB).toBe(tokenA)
    expect(tokenC).toBeUndefined()
  })

  it("clears the whole group when the last sibling is removed", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })
    await setMultipleBirthGroup(a.id, [b.id])

    await setMultipleBirthGroup(a.id, [])

    expect(await tokens([a.id, b.id])).toEqual([undefined, undefined])
  })

  it("never records a group of one", async () => {
    const a = await createPerson({ givenName: "A" })

    await setMultipleBirthGroup(a.id, [])

    expect(await tokens([a.id])).toEqual([undefined])
  })

  it("keeps the existing token when membership is unchanged", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })
    await setMultipleBirthGroup(a.id, [b.id])
    const [before] = await tokens([a.id])

    await setMultipleBirthGroup(a.id, [b.id])

    expect((await tokens([a.id]))[0]).toBe(before)
  })

  it("does not touch anyone outside the group", async () => {
    const a = await createPerson({ givenName: "A" })
    const b = await createPerson({ givenName: "B" })
    const bystander = await createPerson({ givenName: "Bystander" })

    await setMultipleBirthGroup(a.id, [b.id])

    expect((await tokens([bystander.id]))[0]).toBeUndefined()
  })

  it("throws for a person who does not exist", async () => {
    await expect(setMultipleBirthGroup("nope", [])).rejects.toThrow(
      "Person not found"
    )
  })
})
