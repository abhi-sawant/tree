import * as React from "react"

import { cn } from "~/lib/utils"

// A native <select> rather than @base-ui/react's popup Select: every value set
// in this app is a short, flat enum, and the native control already gives us
// keyboard behaviour, touch pickers and screen-reader support for free. Styled
// to match Input so the two line up in a form.
function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative flex w-full items-center">
      <select
        data-slot="select"
        className={cn(
          "h-10 w-full min-w-0 appearance-none border border-transparent border-b-input bg-transparent py-1 pr-6 pl-0 text-base transition-[color,border-color] outline-none focus-visible:border-b-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-b-destructive md:text-sm dark:aria-invalid:border-b-destructive/50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-1 size-3.5 text-muted-foreground"
      >
        <path
          d="M4 6.5 8 10.5 12 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
      </svg>
    </div>
  )
}

export { Select }
