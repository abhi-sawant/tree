import { describe, expect, it } from "vitest"

import {
  BOTTOM_NAV_VIEWS,
  VIEW_PATHS,
  isSubScreen,
  nextNavState,
  originView,
  viewFromPath,
  type ShellView,
} from "~/lib/ui/routes"

describe("viewFromPath", () => {
  it("round-trips every view through its path", () => {
    for (const view of Object.keys(VIEW_PATHS) as ShellView[]) {
      expect(viewFromPath(VIEW_PATHS[view])).toBe(view)
    }
  })

  it("ignores a trailing slash", () => {
    expect(viewFromPath("/people/")).toBe("table")
  })

  it("returns undefined for a path no view owns", () => {
    expect(viewFromPath("/")).toBeUndefined()
    expect(viewFromPath("/nope")).toBeUndefined()
  })
})

describe("isSubScreen", () => {
  it("treats the four bottom-bar views as top level", () => {
    for (const view of BOTTOM_NAV_VIEWS) {
      expect(isSubScreen(view)).toBe(false)
    }
  })

  it("treats everything reached from More as a sub-screen", () => {
    for (const view of ["insights", "health", "settings", "help"] as const) {
      expect(isSubScreen(view)).toBe(true)
    }
  })
})

describe("back navigation state", () => {
  it("records the bottom-bar view a sub-screen is entered from", () => {
    expect(nextNavState("photos", undefined, "insights")).toEqual({
      from: "photos",
    })
  })

  it("keeps the original origin when one sub-screen opens another", () => {
    const state = nextNavState("more", undefined, "health")
    expect(nextNavState("health", state, "settings")).toEqual({ from: "more" })
  })

  it("records nothing when moving to a bottom-bar view", () => {
    expect(nextNavState("insights", { from: "photos" }, "tree")).toBeUndefined()
  })

  it("sends a sub-screen opened by link back to More", () => {
    expect(originView(null)).toBe("more")
    expect(originView({ from: "settings" })).toBe("more")
    expect(originView({ from: "table" })).toBe("table")
  })
})
