import { useSyncExternalStore } from "react"

// Three tiers rather than two, because the two things the desktop layout puts
// beside the canvas fail at different widths: the 360px detail rail is already
// unaffordable on a tablet, while the sidebar is only unaffordable on a phone.
// See ADR D37.
export type ViewportTier = "mobile" | "tablet" | "desktop"

// Tailwind's own `md` and `lg`, restated here because the markup expresses the
// tiers as `max-md:` / `md:max-lg:` / `lg:` variants and this module decides
// the same boundaries in JavaScript. Two sources for one boundary is how a
// sheet ends up open beside a rail that is also on screen, so they are written
// down together — change one and change the other.
export const TABLET_MIN_PX = 768 // Tailwind `md`  (48rem)
export const DESKTOP_MIN_PX = 1024 // Tailwind `lg`  (64rem)

export function resolveTier(width: number): ViewportTier {
  if (width < TABLET_MIN_PX) return "mobile"
  if (width < DESKTOP_MIN_PX) return "tablet"
  return "desktop"
}

const TABLET_QUERY = `(min-width: ${TABLET_MIN_PX}px)`
const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_PX}px)`

// Guarded the way theme-store.ts guards its own matchMedia calls: the tests
// stub matchMedia away entirely, and a component that throws while measuring
// the viewport is worse than one that assumes a desktop.
function currentTier(): ViewportTier {
  if (typeof window === "undefined" || !window.matchMedia) return "desktop"
  if (window.matchMedia(DESKTOP_QUERY).matches) return "desktop"
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet"
  return "mobile"
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  // Both boundaries, because a resize can cross either one without touching
  // the other — 800px to 1200px never changes whether `md` matches.
  const queries = [
    window.matchMedia(TABLET_QUERY),
    window.matchMedia(DESKTOP_QUERY),
  ]
  for (const query of queries) query.addEventListener("change", onChange)
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange)
  }
}

// useSyncExternalStore rather than an effect that sets state: the tier is read
// during render by components that pick a container (an aside or a sheet), and
// a one-frame-late value there means mounting the wrong one and then throwing
// it away, which for the detail sheet is a visible flash.
export function useViewportTier(): ViewportTier {
  return useSyncExternalStore(subscribe, currentTier, () => "desktop")
}

export function useIsMobile(): boolean {
  return useViewportTier() === "mobile"
}

// The condition for everything that had to move off the side of the canvas:
// true on a phone and on a tablet, false only where there is room for a rail.
export function useIsCompact(): boolean {
  return useViewportTier() !== "desktop"
}
