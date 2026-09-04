import { Download, Images, Menu, Network, Users } from "lucide-react"

import { useAppShellStore, type ShellView } from "~/lib/ui/app-shell-store"
import { cn } from "~/lib/utils"

// Four destinations, because four is what a thumb can hit across a 390px bar
// without aiming. Everything else in the app is reached from More, which is
// itself one of the four rather than an overlay — the bar stays lit under it,
// so the reader is somewhere rather than in front of something.
//
// A sub-screen (Insights, Health, Settings, Help) lights the tab it was opened
// from, not nothing: the bar's job is to say where you are in the app, and
// "nowhere" is never the honest answer.
const TABS: Array<{ label: string; target: ShellView; icon: typeof Users }> = [
  { label: "Tree", target: "tree", icon: Network },
  { label: "People", target: "table", icon: Users },
  { label: "Photos", target: "photos", icon: Images },
  { label: "More", target: "more", icon: Menu },
]

export function MobileBottomNav() {
  const view = useAppShellStore((s) => s.view)
  const previousView = useAppShellStore((s) => s.previousView)
  const setView = useAppShellStore((s) => s.setView)
  const setMobileSheet = useAppShellStore((s) => s.setMobileSheet)

  // On a sub-screen the highlighted tab is the one we came from — otherwise
  // opening Health would leave the bar with nothing lit.
  const current = TABS.some((tab) => tab.target === view) ? view : previousView

  return (
    <nav
      data-print="hide"
      aria-label="Main"
      className="grid flex-none grid-cols-5 gap-1 border-t border-border bg-sidebar px-2.5 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
    >
      {TABS.map(({ label, target, icon: Icon }) => {
        const active = current === target
        return (
          <button
            key={target}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => setView(target)}
            className={cn(
              "flex h-9 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl text-11",
              active
                ? "bg-primary/10 font-semibold text-primary"
                : "font-medium text-muted-foreground"
            )}
          >
            <Icon className="size-4.5" />
          </button>
        )
      })}
      {/* Not a destination — nothing here lights up or changes what "current"
          means — just the one action that used to live in the topbar's now-
          removed second row. */}
      <button
        type="button"
        aria-label="Export"
        onClick={() => setMobileSheet("export")}
        className="flex h-9 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl text-11 font-medium text-muted-foreground"
      >
        <Download className="size-4.5" />
      </button>
    </nav>
  )
}
