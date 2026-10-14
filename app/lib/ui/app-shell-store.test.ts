import { describe, expect, it } from "vitest"

import { resolveActiveTreeId } from "~/lib/ui/app-shell-store"

describe("resolveActiveTreeId", () => {
  it("keeps the active tree when it still exists", () => {
    expect(resolveActiveTreeId(["a", "b"], "b", "a")).toBe("b")
  })

  it("falls back to the last-opened tree when nothing is active", () => {
    expect(resolveActiveTreeId(["a", "b"], null, "b")).toBe("b")
  })

  it("falls back to the first tree when the remembered ids are gone", () => {
    expect(resolveActiveTreeId(["a", "b"], "deleted", "also-deleted")).toBe("a")
  })

  it("returns undefined when there are no trees", () => {
    expect(resolveActiveTreeId([], "a", "b")).toBeUndefined()
  })
})
