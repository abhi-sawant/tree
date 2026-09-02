import {
  SidebarContent,
  type SidebarContentProps,
} from "~/components/shell/sidebar-content"
import { useAppShellStore } from "~/lib/ui/app-shell-store"

type MoreViewProps = Omit<SidebarContentProps, "variant" | "onClose">

// The fourth bottom-bar tab: everything the bar itself has no room for. It is
// the desktop sidebar's content at phone scale, from the same component, so a
// destination can't exist on one and not the other (D23).
export function MoreView(props: MoreViewProps) {
  const goBack = useAppShellStore((s) => s.goBack)

  return (
    <div
      data-print="hide"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <SidebarContent {...props} variant="page" onClose={goBack} />
    </div>
  )
}
