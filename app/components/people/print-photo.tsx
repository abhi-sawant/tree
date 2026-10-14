import { usePhotoUrl } from "~/lib/db/hooks"

interface PrintPhotoProps {
  photoId?: string
  initials: string
  // Any CSS colour: the tile behind the initials when there is no photo.
  color: string
  // Tiles under about 80px: smaller lettering so the initials stay inside.
  small?: boolean
}

// The picture area of a tree card. A real photo fills it; without one it is a
// colour tile with the person's initials, so a tree with no photos at all still
// reads as a family and nobody is given a stand-in face.
export function PrintPhoto({
  photoId,
  initials,
  color,
  small,
}: PrintPhotoProps) {
  const url = usePhotoUrl(photoId)

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="min-h-0 w-full flex-1 rounded-md object-cover"
      />
    )
  }

  return (
    <div
      aria-hidden
      className={`relative grid min-h-0 w-full flex-1 place-items-center overflow-hidden rounded-md font-heading font-bold tracking-wide text-white ${small ? "text-base" : "text-4xl"}`}
      style={{ background: color }}
    >
      <span className="absolute inset-x-[-20%] -bottom-1/2 h-4/5 rounded-full bg-white/15" />
      <span className="relative">{initials}</span>
    </div>
  )
}
