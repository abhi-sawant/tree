import {
  SidebarContent,
  type SidebarContentProps,
} from "~/components/shell/sidebar-content"
import { useViewportTier } from "~/lib/ui/viewport-tier"

type AppSidebarProps = Omit<SidebarContentProps, "variant" | "onClose">

// The desktop rail, and its tablet form. Not rendered at all on a phone, where
// the bottom bar and the More screen take over — see MobileBottomNav.
//
// The tablet form is a 56px icon strip rather than a narrower version of the
// full rail: 212px of names is a fifth of a 1024px window, and the detail
// sheet has already taken the other side. The catalog doesn't cover this
// width, so the rule chosen was to drop no destination — the tree list and the
// storage card move behind the two rail buttons that stand for them.
export function AppSidebar(props: AppSidebarProps) {
  const tier = useViewportTier()
  if (tier === "mobile") return null
  const rail = tier === "tablet"

  return (
    <div
      data-print="hide"
      className={
        rail
          ? "flex w-14 flex-none flex-col items-center gap-3 border-r border-border bg-sidebar px-2 py-4"
          : "flex w-53 flex-none flex-col gap-4.5 border-r border-border bg-sidebar px-3 py-4"
      }
    >
      <SidebarContent {...props} variant={rail ? "rail" : "full"} />
    </div>
  )
}
