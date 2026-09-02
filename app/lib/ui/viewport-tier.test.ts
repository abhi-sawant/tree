import { describe, expect, it } from "vitest"

import {
  DESKTOP_MIN_PX,
  TABLET_MIN_PX,
  resolveTier,
} from "~/lib/ui/viewport-tier"

describe("resolveTier", () => {
  it("puts a phone in the mobile tier", () => {
    expect(resolveTier(320)).toBe("mobile")
    expect(resolveTier(390)).toBe("mobile")
  })

  it("treats each boundary as the first width of the wider tier", () => {
    expect(resolveTier(TABLET_MIN_PX - 1)).toBe("mobile")
    expect(resolveTier(TABLET_MIN_PX)).toBe("tablet")
    expect(resolveTier(DESKTOP_MIN_PX - 1)).toBe("tablet")
    expect(resolveTier(DESKTOP_MIN_PX)).toBe("desktop")
  })

  it("puts a laptop and up in the desktop tier", () => {
    expect(resolveTier(1280)).toBe("desktop")
    expect(resolveTier(2560)).toBe("desktop")
  })

  // The boundaries have to stay the pixel values of Tailwind's md and lg, or
  // the JS tier and the max-md:/md:max-lg:/lg: variants in the markup describe
  // different layouts.
  it("matches Tailwind's md and lg breakpoints", () => {
    expect(TABLET_MIN_PX).toBe(768)
    expect(DESKTOP_MIN_PX).toBe(1024)
  })
})
