import { describe, expect, it } from "vitest"

import {
  coverPhotoId,
  movePhotoId,
  personPhotoCount,
  personPhotoIds,
  photoFieldsFor,
  withCoverPhotoId,
  withoutPhotoId,
} from "~/lib/person-photos"

describe("personPhotoIds", () => {
  it("reads the array when it is present", () => {
    expect(personPhotoIds({ photoIds: ["a", "b"] })).toEqual(["a", "b"])
  })

  it("falls back to the legacy scalar for data written before the array", () => {
    expect(personPhotoIds({ photoId: "a" })).toEqual(["a"])
  })

  it("prefers the array over a stale scalar", () => {
    expect(personPhotoIds({ photoIds: ["b", "c"], photoId: "a" })).toEqual([
      "b",
      "c",
    ])
  })

  // The bug this guards: treating [] as "no answer" and falling through to the
  // scalar would make removing a person's last photo silently undo itself.
  it("treats an empty array as an answer, not as absent", () => {
    expect(personPhotoIds({ photoIds: [], photoId: "a" })).toEqual([])
  })

  it("answers for a person with no photos at all, and for no person", () => {
    expect(personPhotoIds({})).toEqual([])
    expect(personPhotoIds(undefined)).toEqual([])
  })
})

describe("coverPhotoId", () => {
  it("is the first of the list", () => {
    expect(coverPhotoId({ photoIds: ["b", "a"] })).toBe("b")
  })

  it("is the legacy scalar for old data", () => {
    expect(coverPhotoId({ photoId: "a" })).toBe("a")
  })

  it("is undefined when there are none", () => {
    expect(coverPhotoId({ photoIds: [] })).toBeUndefined()
    expect(coverPhotoId(undefined)).toBeUndefined()
  })
})

describe("personPhotoCount", () => {
  it("counts the list, and the legacy scalar as one", () => {
    expect(personPhotoCount({ photoIds: ["a", "b", "c"] })).toBe(3)
    expect(personPhotoCount({ photoId: "a" })).toBe(1)
    expect(personPhotoCount({})).toBe(0)
  })
})

describe("photoFieldsFor", () => {
  it("mirrors the cover into the legacy scalar", () => {
    expect(photoFieldsFor(["a", "b"])).toEqual({
      photoIds: ["a", "b"],
      photoId: "a",
    })
  })

  // Both keys must be present-and-undefined rather than omitted, because
  // updatePerson spreads the patch over the existing row.
  it("clears both fields when there are no photos left", () => {
    const fields = photoFieldsFor([])
    expect(fields).toEqual({ photoIds: undefined, photoId: undefined })
    expect(Object.keys(fields).sort()).toEqual(["photoId", "photoIds"])
  })

  it("keeps the mirror in step for every list it is given", () => {
    for (const ids of [["a"], ["a", "b"], ["c", "a", "b"]]) {
      const fields = photoFieldsFor(ids)
      expect(fields.photoId).toBe(coverPhotoId(fields))
    }
  })
})

describe("withoutPhotoId", () => {
  it("removes the named photo and keeps the rest in order", () => {
    expect(withoutPhotoId(["a", "b", "c"], "b")).toEqual(["a", "c"])
  })

  it("is a no-op for an id that isn't there", () => {
    expect(withoutPhotoId(["a", "b"], "z")).toEqual(["a", "b"])
  })
})

describe("withCoverPhotoId", () => {
  it("promotes the named photo without reordering the rest", () => {
    expect(withCoverPhotoId(["a", "b", "c"], "c")).toEqual(["c", "a", "b"])
  })

  it("leaves an already-cover photo alone", () => {
    expect(withCoverPhotoId(["a", "b"], "a")).toEqual(["a", "b"])
  })

  it("ignores an id the person doesn't have", () => {
    expect(withCoverPhotoId(["a", "b"], "z")).toEqual(["a", "b"])
  })
})

describe("movePhotoId", () => {
  it("moves a photo later", () => {
    expect(movePhotoId(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"])
  })

  it("moves a photo earlier", () => {
    expect(movePhotoId(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
  })

  it("ignores a move that goes nowhere or off either end", () => {
    expect(movePhotoId(["a", "b"], 1, 1)).toEqual(["a", "b"])
    expect(movePhotoId(["a", "b"], -1, 0)).toEqual(["a", "b"])
    expect(movePhotoId(["a", "b"], 0, 5)).toEqual(["a", "b"])
  })
})
