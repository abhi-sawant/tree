import {
  SidebarContent,
  type SidebarContentProps,
} from "~/components/shell/sidebar-content"
import { useViewportTier } from "~/lib/ui/viewport-tier"

type AppSidebarProps = Omit<SidebarContentProps, "variant" | "onClose">

// The desktop side panel: which tree is open, what the card colours mean, and
// whether the data is safe. Tablet and phone drop it — the tablet's topbar
// carries the tree switcher and every destination, and the phone's bottom bar
// and More screen take over (see MobileBottomNav).
export function AppSidebar(props: AppSidebarProps) {
  const tier = useViewportTier()
  if (tier !== "desktop") return null

  return (
    <div
      data-print="hide"
      className="flex w-60 flex-none flex-col gap-6 overflow-y-auto border-r border-border bg-sidebar px-3.5 py-5"
    >
      <SidebarContent {...props} variant="full" />
    </div>
  )
}
