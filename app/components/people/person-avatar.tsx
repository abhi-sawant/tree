import { UserRound } from "lucide-react"

import { usePhotoUrl } from "~/lib/db/hooks"
import { cn } from "~/lib/utils"

const sizeClasses = {
  sm: "size-6",
  lg: "size-16",
} as const

interface PersonAvatarProps {
  photoId?: string
  size?: keyof typeof sizeClasses
  className?: string
}

export function PersonAvatar({ photoId, size = "sm", className }: PersonAvatarProps) {
  const url = usePhotoUrl(photoId)

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={cn(sizeClasses[size], "shrink-0 rounded-full object-cover", className)}
      />
    )
  }

  return <UserRound className={cn(sizeClasses[size], "shrink-0 text-muted-foreground", className)} />
}
