import { beforeEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import {
  dismiss,
  listDismissals,
  removeDismissalsForPerson,
  undismiss,
} from "~/lib/db/dismissals"
import { createPerson, deletePerson } from "~/lib/db/people"

beforeEach(async () => {
  await db.dismissals.clear()
  await db.people.clear()
})

describe("dismissals", () => {
  it("records one and reads it back", async () => {
    await dismiss(
      { key: "missing-birth-year:a", kind: "finding", personIds: ["a"] },
      new Date("2026-09-03T10:00:00Z")
    )
    const rows = await listDismissals()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: "missing-birth-year:a",
      kind: "finding",
      personIds: ["a"],
      dismissedAt: new Date("2026-09-03T10:00:00Z").getTime(),
    })
  })

  it("is keyed, so dismissing the same finding twice leaves one row", async () => {
    const input = {
      key: "missing-birth-year:a",
      kind: "finding" as const,
      personIds: ["a"],
    }
    await dismiss(input)
    await dismiss(input)
    expect(await listDismissals()).toHaveLength(1)
  })

  it("stores person ids sorted, whatever order they arrive in", async () => {
    await dismiss({ key: "k", kind: "duplicate", personIds: ["b", "a"] })
    const [row] = await listDismissals()
    expect(row.personIds).toEqual(["a", "b"])
  })

  it("un-dismisses", async () => {
    await dismiss({ key: "k", kind: "finding", personIds: ["a"] })
    await undismiss("k")
    expect(await listDismissals()).toEqual([])
  })

  it("finds a dismissal by either person in a pair", async () => {
    await dismiss({ key: "dup:a,b", kind: "duplicate", personIds: ["a", "b"] })
    await removeDismissalsForPerson("b")
    expect(await listDismissals()).toEqual([])
  })
})

describe("deletePerson cascade", () => {
  it("takes the deleted person's dismissals with them", async () => {
    const person = await createPerson({ givenName: "Suniti" })
    const other = await createPerson({ givenName: "Meera" })
    await dismiss({
      key: `missing-birth-year:${person.id}`,
      kind: "finding",
      personIds: [person.id],
    })
    await dismiss({
      key: `missing-birth-year:${other.id}`,
      kind: "finding",
      personIds: [other.id],
    })

    await deletePerson(person.id)

    const rows = await listDismissals()
    // Only the survivor's. A dismissal about somebody who no longer exists can
    // never match again, and would silence a new finding if the id came back.
    expect(rows.map((row) => row.personIds)).toEqual([[other.id]])
  })

  it("removes a pair dismissal when either side is deleted", async () => {
    const a = await createPerson({ givenName: "Suresh" })
    const b = await createPerson({ givenName: "Sureshbabu" })
    await dismiss({
      key: `duplicate:${[a.id, b.id].sort().join(",")}`,
      kind: "duplicate",
      personIds: [a.id, b.id],
    })

    await deletePerson(b.id)

    expect(await listDismissals()).toEqual([])
  })
})
