import { beforeEach, describe, expect, it } from "vitest"

import {
  BOTTOM_NAV_VIEWS,
  isSubScreen,
  resolveActiveTreeId,
  useAppShellStore,
} from "~/lib/ui/app-shell-store"

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

describe("isSubScreen", () => {
  it("treats the four bottom-bar views as top level", () => {
    for (const view of BOTTOM_NAV_VIEWS) {
      expect(isSubScreen(view)).toBe(false)
    }
  })

  it("treats everything reached from More as a sub-screen", () => {
    expect(isSubScreen("insights")).toBe(true)
    expect(isSubScreen("health")).toBe(true)
    expect(isSubScreen("settings")).toBe(true)
    expect(isSubScreen("help")).toBe(true)
  })
})

describe("back navigation", () => {
  beforeEach(() => {
    useAppShellStore.setState({ view: "tree", previousView: "tree" })
  })

  it("returns to the bottom-bar view a sub-screen was opened from", () => {
    const { setView, goBack } = useAppShellStore.getState()
    setView("photos")
    setView("insights")
    goBack()
    expect(useAppShellStore.getState().view).toBe("photos")
  })

  it("keeps the original return point when one sub-screen opens another", () => {
    const { setView, goBack } = useAppShellStore.getState()
    setView("more")
    setView("health")
    setView("settings")
    goBack()
    // Not "health" — this store keeps a return point, not a history, and
    // walking back through sub-screens would need the latter.
    expect(useAppShellStore.getState().view).toBe("more")
  })

  it("closes any open sheet when the view changes", () => {
    const { setView, setMobileSheet } = useAppShellStore.getState()
    setMobileSheet("export")
    setView("table")
    expect(useAppShellStore.getState().mobileSheet).toBeNull()
  })
})
