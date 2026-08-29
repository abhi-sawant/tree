import { describe, expect, it } from "vitest"

describe("vitest + jsdom setup", () => {
  it("has a DOM environment available", () => {
    expect(typeof document).toBe("object")
    expect(document.createElement("div")).toBeInstanceOf(HTMLDivElement)
  })
})
