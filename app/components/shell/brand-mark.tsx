import { cn } from "~/lib/utils"

// The app's mark: a round canopy with three people-dots on a trunk, on a poppy
// tile. Drawn here rather than loaded as an image so it follows the theme and
// costs no request.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9.5 flex-none items-center justify-center rounded-xl bg-primary text-primary-foreground",
        className
      )}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 21v-7" />
        <path d="M12 14c-4.5 0-8-2.6-8-6.5S7.5 2 12 2s8 1.6 8 5.5-3.5 6.5-8 6.5Z" />
        <circle cx="9" cy="8" r=".6" fill="currentColor" />
        <circle cx="15" cy="8" r=".6" fill="currentColor" />
        <circle cx="12" cy="5.5" r=".6" fill="currentColor" />
      </svg>
    </span>
  )
}
