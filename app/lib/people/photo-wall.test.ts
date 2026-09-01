import { describe, expect, it } from "vitest"

import { buildPhotoWall } from "~/lib/people/photo-wall"
import type { Person } from "~/lib/types"

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    givenName: id,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe("buildPhotoWall", () => {
  it("keeps only the people who have a face, and says how many didn't", () => {
    const wall = buildPhotoWall([
      person("a", { photoId: "p1" }),
      person("b"),
      person("c", { photoIds: ["p2"] }),
    ])

    expect(wall.entries.map((e) => e.personId).sort()).toEqual(["a", "c"])
    expect(wall.considered).toBe(3)
    expect(wall.withPhoto).toBe(2)
  })

  it("shows the cover and counts the rest", () => {
    const wall = buildPhotoWall([
      person("a", { photoIds: ["cover", "p2", "p3"] }),
    ])

    expect(wall.entries[0]).toMatchObject({
      coverPhotoId: "cover",
      extraPhotoCount: 2,
    })
  })

  it("reads a photo from the legacy scalar too", () => {
    const wall = buildPhotoWall([person("a", { photoId: "old" })])

    expect(wall.entries[0]).toMatchObject({
      coverPhotoId: "old",
      extraPhotoCount: 0,
    })
  })

  it("sorts oldest first with unknown birth dates last", () => {
    const wall = buildPhotoWall([
      person("young", { photoId: "p1", birth: { year: 1980 } }),
      person("unknown", { photoId: "p2" }),
      person("old", { photoId: "p3", birth: { year: 1900 } }),
    ])

    expect(wall.entries.map((e) => e.personId)).toEqual([
      "old",
      "young",
      "unknown",
    ])
  })

  it("breaks a date tie on name so the order is stable", () => {
    const wall = buildPhotoWall([
      person("b", { givenName: "Bea", photoId: "p1", birth: { year: 1900 } }),
      person("a", { givenName: "Ada", photoId: "p2", birth: { year: 1900 } }),
    ])

    expect(wall.entries.map((e) => e.name)).toEqual(["Ada", "Bea"])
  })

  it("sorts by name when asked, ignoring dates", () => {
    const wall = buildPhotoWall(
      [
        person("z", { givenName: "Zoe", photoId: "p1", birth: { year: 1900 } }),
        person("a", { givenName: "Ada", photoId: "p2", birth: { year: 1990 } }),
      ],
      { sort: "name" }
    )

    expect(wall.entries.map((e) => e.name)).toEqual(["Ada", "Zoe"])
  })

  it("narrows to the given people and counts only those", () => {
    const wall = buildPhotoWall(
      [person("a", { photoId: "p1" }), person("b", { photoId: "p2" })],
      { limitToPersonIds: new Set(["a"]) }
    )

    expect(wall.entries.map((e) => e.personId)).toEqual(["a"])
    expect(wall.considered).toBe(1)
  })

  it("formats a lifespan from whichever dates are recorded", () => {
    const wall = buildPhotoWall([
      person("both", {
        photoId: "p1",
        birth: { year: 1912 },
        death: { year: 1987 },
      }),
      person("birth", { photoId: "p2", birth: { year: 1930 } }),
      person("death", { photoId: "p3", death: { year: 1950 } }),
      person("neither", { photoId: "p4" }),
    ])

    const byId = new Map(wall.entries.map((e) => [e.personId, e.lifespan]))
    expect(byId.get("both")).toBe("1912 – 1987")
    expect(byId.get("birth")).toBe("b. 1930")
    expect(byId.get("death")).toBe("d. 1950")
    expect(byId.get("neither")).toBe("")
  })
})
