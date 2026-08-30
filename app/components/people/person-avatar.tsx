import { UserRound } from "lucide-react"

import { usePhotoUrl } from "~/lib/db/hooks"
import { cn } from "~/lib/utils"

const sizeClasses = {
  sm: "size-6",
  lg: "size-26",
} as const

interface PersonAvatarProps {
  photoId?: string
  size?: keyof typeof sizeClasses
  className?: string
}

export function PersonAvatar({
  photoId,
  size = "lg",
  className,
}: PersonAvatarProps) {
  const url = usePhotoUrl(photoId)

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={cn(
          sizeClasses[size],
          "shrink-0 rounded-full object-cover",
          className
        )}
      />
    )
  }

  return (
    <img
      src={"/user.png"}
      alt=""
      className={cn(
        sizeClasses[size],
        "shrink-0 rounded-full object-cover",
        className
      )}
    />
  )
}
