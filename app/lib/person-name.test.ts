import { describe, expect, it } from "vitest"

import { personDisplayName, personNameSegments } from "~/lib/person-name"

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

// The People table lays these out itself so it can make the given and family
// parts editable in place. They have to stay the same parts, in the same
// order, that personDisplayName joins — hence one definition, tested here.
describe("personNameSegments", () => {
  it("quotes the nickname, so callers never have to", () => {
    expect(
      personNameSegments({
        givenName: "Augusta",
        familyName: "King",
        nickname: "Ada",
      })
    ).toEqual({
      givenName: "Augusta",
      nickname: "\u201cAda\u201d",
      familyName: "King",
    })
  })

  it("reports an absent nickname and family name as absent", () => {
    expect(personNameSegments({ givenName: "Ada" })).toEqual({
      givenName: "Ada",
      nickname: undefined,
      familyName: undefined,
    })
  })

  it("joins back to exactly what personDisplayName produces", () => {
    const person = { givenName: "Augusta", familyName: "King", nickname: "Ada" }
    const { givenName, nickname, familyName } = personNameSegments(person)
    expect([givenName, nickname, familyName].filter(Boolean).join(" ")).toBe(
      personDisplayName(person)
    )
  })
})
