import { useMemo, useState } from "react"

import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { Select } from "~/components/ui/select"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { usePhotoUrls } from "~/lib/db/hooks"
import { personNodeId } from "~/lib/graph/node-ids"
import {
  buildPhotoWall,
  PHOTO_WALL_SORTS,
  type PhotoWallEntry,
  type PhotoWallSort,
} from "~/lib/people/photo-wall"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import type { Person, Tree } from "~/lib/types"

interface PhotoWallViewProps {
  tree: Tree
  // The whole pool. Scoping is the user's choice here rather than a fixed
  // decision: a photo wall is browsing, and the two questions — "show me every
  // face I have" and "show me this family" — are both reasonable. It opens on
  // the whole pool, matching the People table it is the visual counterpart to.
  people: Person[]
  memberIds: Set<string>
}

export function PhotoWallView({ tree, people, memberIds }: PhotoWallViewProps) {
  const [sort, setSort] = useState<PhotoWallSort>("birth")
  const [treeOnly, setTreeOnly] = useState(false)
  const setView = useAppShellStore((s) => s.setView)

  const wall = useMemo(
    () =>
      buildPhotoWall(people, {
        sort,
        limitToPersonIds: treeOnly ? memberIds : undefined,
      }),
    [people, sort, treeOnly, memberIds]
  )

  const coverIds = useMemo(
    () => wall.entries.map((entry) => entry.coverPhotoId),
    [wall]
  )
  const urls = usePhotoUrls(coverIds)

  const missing = wall.considered - wall.withPhoto

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 max-md:gap-3.5 max-md:p-4">
      <div className="flex flex-wrap items-center gap-4 max-md:gap-x-3 max-md:gap-y-2.5">
        <h2 className="font-heading text-sm font-semibold max-md:basis-full max-md:text-lg">
          Photo wall
        </h2>
        {/* Stated first on a phone: it is the answer to "why are there gaps",
            and at the end of a wrapping row it lands under the controls. */}
        <span className="hidden text-12-5 text-muted-foreground max-md:-mt-2 max-md:block max-md:basis-full">
          {wall.withPhoto} of {wall.considered}{" "}
          {wall.considered === 1 ? "person has" : "people have"} a photo
        </span>
        <Label
          data-print="hide"
          className="flex-row items-center gap-2 text-sm font-normal normal-case"
        >
          <Checkbox
            checked={treeOnly}
            onCheckedChange={(checked) => setTreeOnly(checked === true)}
          />
          Only {tree.name}
        </Label>
        {/* Select's own wrapper is w-full, so the width has to be set on a
            container rather than on the control. */}
        <div data-print="hide" className="w-40">
          <Select
            className="h-8"
            value={sort}
            onChange={(e) => setSort(e.target.value as PhotoWallSort)}
          >
            {PHOTO_WALL_SORTS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <span className="ml-auto text-xs text-muted-foreground max-md:hidden">
          {wall.withPhoto} of {wall.considered}{" "}
          {wall.considered === 1 ? "person has" : "people have"} a photo
        </span>
      </div>

      {wall.withPhoto === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-md text-13 leading-relaxed text-muted-foreground">
            No photos yet. Add one from a person&apos;s Media tab and their face
            will appear here.
          </p>
          {/* Prose alone leaves the reader on a screen with nothing to do but
              go back the way they came. */}
          <Button variant="outline" size="sm" onClick={() => setView("table")}>
            Go to People
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 max-md:grid-cols-2">
          {wall.entries.map((entry) => (
            <PhotoTile
              key={entry.personId}
              entry={entry}
              url={urls.get(entry.coverPhotoId)}
            />
          ))}
        </ul>
      )}

      {missing > 0 && wall.withPhoto > 0 && (
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          {missing === 1
            ? "1 person here has no photo yet."
            : `${missing} people here have no photo yet.`}{" "}
          They&apos;re left out rather than shown as blank tiles — a wall of
          default avatars says nothing about who is missing.
        </p>
      )}
    </div>
  )
}

function PhotoTile({
  entry,
  url,
}: {
  entry: PhotoWallEntry
  url: string | undefined
}) {
  const setView = useAppShellStore((s) => s.setView)
  const requestCenter = useCanvasUIStore((s) => s.requestCenter)

  return (
    <li>
      <button
        type="button"
        className="flex w-full cursor-pointer flex-col gap-1.5 text-left"
        // The same thing clicking a row in the People table does: take me to
        // this person on the canvas.
        onClick={() => {
          requestCenter(personNodeId(entry.personId))
          setView("tree")
        }}
      >
        <span className="relative block aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
          <img
            // Lazy, because a family with three hundred photos would otherwise
            // decode all of them before the first row is on screen.
            loading="lazy"
            src={url ?? "/user.png"}
            alt=""
            className="size-full object-cover"
          />
          {entry.extraPhotoCount > 0 && (
            <span className="absolute right-1 bottom-1 bg-background/85 px-1 font-heading text-10 font-semibold">
              +{entry.extraPhotoCount}
            </span>
          )}
        </span>
        <span className="truncate text-12-5 font-semibold">{entry.name}</span>
        {entry.lifespan && (
          <span className="truncate text-11 text-muted-foreground">
            {entry.lifespan}
          </span>
        )}
      </button>
    </li>
  )
}
