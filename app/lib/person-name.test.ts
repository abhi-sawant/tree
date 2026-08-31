import { describe, expect, it } from "vitest"

import { personDisplayName } from "~/lib/person-name"

describe("personDisplayName", () => {
  it("joins given and family name", () => {
    expect(
      personDisplayName({ givenName: "Ada", familyName: "Lovelace" })
    ).toBe("Ada Lovelace")
  })

  it("places a nickname in quotes between the names", () => {
    expect(
      personDisplayName({
        givenName: "Augusta",
        familyName: "King",
        nickname: "Ada",
      })
    ).toBe("Augusta “Ada” King")
  })

  it("omits a missing family name without leaving a stray space", () => {
    expect(personDisplayName({ givenName: "Ada" })).toBe("Ada")
    expect(personDisplayName({ givenName: "Ada", nickname: "A" })).toBe(
      "Ada “A”"
    )
  })

  it("falls back to Unnamed when there is nothing to show", () => {
    expect(personDisplayName({ givenName: "" })).toBe("Unnamed")
  })
})
