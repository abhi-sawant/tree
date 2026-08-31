import { UserRound } from "lucide-react"

import { usePhotoUrl } from "~/lib/db/hooks"
import { cn } from "~/lib/utils"

const sizeClasses = {
  xs: "size-5.5",
  sm: "size-6",
  md: "size-6.5",
  lg: "size-26",
  // The canvas card and the detail-panel header both size their avatar to the
  // pixel, so they get named sizes rather than a className override.
  card: "size-30",
  panel: "size-13",
} as const

interface PersonAvatarProps {
  photoId?: string
  size?: keyof typeof sizeClasses
  // Overrides `size` with an exact pixel value — used where the avatar size
  // is user-configurable (the canvas card) rather than a fixed design size.
  sizePx?: number
  className?: string
}

export function PersonAvatar({
  photoId,
  size = "lg",
  sizePx,
  className,
}: PersonAvatarProps) {
  const url = usePhotoUrl(photoId)
  const style = sizePx ? { width: sizePx, height: sizePx } : undefined

  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={style}
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
      style={style}
      className={cn(
        sizeClasses[size],
        "shrink-0 rounded-full object-cover",
        className
      )}
    />
  )
}
