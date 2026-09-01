import { afterEach, describe, expect, it } from "vitest"

import { db } from "~/lib/db/db"
import { readPhotoSizes } from "~/lib/db/photo-sizes"

afterEach(async () => {
  await db.photos.clear()
})

describe("readPhotoSizes", () => {
  it("reports the byte length of every stored photo", async () => {
    await db.photos.bulkAdd([
      { id: "a", mime: "image/jpeg", blob: new Blob(["x".repeat(30)]) },
      { id: "b", mime: "image/png", blob: new Blob(["x".repeat(7)]) },
    ])

    const sizes = await readPhotoSizes()

    expect(sizes).toHaveLength(2)
    expect(sizes.find((s) => s.id === "a")).toEqual({
      id: "a",
      mime: "image/jpeg",
      size: 30,
    })
    expect(sizes.find((s) => s.id === "b")?.size).toBe(7)
  })

  it("returns an empty list when nothing is stored", async () => {
    expect(await readPhotoSizes()).toEqual([])
  })
})
