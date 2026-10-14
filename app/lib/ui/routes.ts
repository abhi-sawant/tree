// "more" exists only on a phone: the four views the bottom bar can hold are
// Tree, People, Photos and More, and More is the page everything else lives on.
// It is a view rather than an overlay because that is what the design draws —
// the bottom bar stays visible with More lit, so the reader is somewhere rather
// than in front of something.
export type ShellView =
  | "tree"
  | "table"
  | "photos"
  | "insights"
  | "health"
  | "settings"
  | "help"
  | "more"

// Every view is a URL, so a reload or a pasted link lands on the same screen.
// Paths are the reader's word for the screen, not the internal view id —
// "table" is the People page.
export const VIEW_PATHS: Record<ShellView, string> = {
  tree: "/tree",
  table: "/people",
  photos: "/photos",
  insights: "/insights",
  health: "/health",
  settings: "/settings",
  help: "/help",
  more: "/more",
}

export const DEFAULT_VIEW: ShellView = "tree"

// Undefined for a path no view owns, so the caller decides what an unknown URL
// means rather than this silently picking a screen.
export function viewFromPath(pathname: string): ShellView | undefined {
  const normalised = pathname.replace(/\/+$/, "") || "/"
  for (const view of Object.keys(VIEW_PATHS) as ShellView[]) {
    if (VIEW_PATHS[view] === normalised) return view
  }
  return undefined
}

// The views the mobile bottom bar reaches directly. Everything else is a
// sub-screen pushed from More, and gets a back affordance to it.
export const BOTTOM_NAV_VIEWS: ShellView[] = ["tree", "table", "photos", "more"]

export function isSubScreen(view: ShellView): boolean {
  return !BOTTOM_NAV_VIEWS.includes(view)
}

// Carried in the history entry's state rather than in a store: it survives a
// reload with the entry, and it dies with it, which is exactly the lifetime a
// "where did I come from" hint should have.
export interface NavState {
  from?: ShellView
}

// The bottom-bar view a sub-screen was opened from. Only ever a bottom-bar
// view, so backing out of Health can't land on Settings just because that is
// where the reader came from. A sub-screen opened by link has no origin, and
// More is the one page every sub-screen is listed on.
export function originView(state: unknown): ShellView {
  const from = (state as NavState | null)?.from
  return from && !isSubScreen(from) ? from : "more"
}

// What to record as `from` when moving between views: entering a sub-screen
// remembers the bottom-bar view it was entered from, unless we came from
// another sub-screen, in which case the origin we already knew is still right.
export function nextNavState(
  current: ShellView,
  currentState: unknown,
  target: ShellView
): NavState | undefined {
  if (!isSubScreen(target)) return undefined
  return { from: isSubScreen(current) ? originView(currentState) : current }
}
