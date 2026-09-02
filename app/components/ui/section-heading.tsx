import * as React from "react"

import { cn } from "~/lib/utils"

function SectionHeading({
  as: Tag = "h2",
  className,
  ...props
}: React.ComponentProps<"h2"> & { as?: "h2" | "h3" }) {
  return <Tag className={cn("text-sm font-semibold", className)} {...props} />
}

export { SectionHeading }
