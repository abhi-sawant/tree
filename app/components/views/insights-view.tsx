import { useMemo } from "react"

import { Button } from "~/components/ui/button"
import { MobileScreenHeader } from "~/components/shell/mobile-screen-header"
import { SectionHeading } from "~/components/ui/section-heading"
import {
  findAnniversaries,
  type Anniversary,
} from "~/lib/analysis/anniversaries"
import {
  computeStatistics,
  type NamedValue,
  type Statistics,
} from "~/lib/analysis/statistics"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { personNodeId } from "~/lib/graph/node-ids"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import {
  ANNIVERSARY_WINDOWS,
  anniversaryWindowLabel,
  useInsightsStore,
} from "~/lib/ui/insights-store"
import type { Person, Relationship, Tree } from "~/lib/types"

// How far ahead to look when nothing falls today. Roughly a month: far enough
// that the section is rarely empty, near enough that what it shows is still
// worth acting on.

interface InsightsViewProps {
  tree: Tree
  // Already narrowed to this tree's members by the shell.
  people: Person[]
  relationships: Relationship[]
  // Injected so this can be reasoned about at a fixed date rather than
  // depending on whenever the view happened to render.
  today?: Date
}

export function InsightsView({
  tree,
  people,
  relationships,
  today,
}: InsightsViewProps) {
  const setView = useAppShellStore((s) => s.setView)
  const requestCenter = useCanvasUIStore((s) => s.requestCenter)
  const windowDays = useInsightsStore((s) => s.anniversaryWindowDays)
  const setWindowDays = useInsightsStore((s) => s.setAnniversaryWindowDays)

  const stats = useMemo(
    () => computeStatistics(people, relationships),
    [people, relationships]
  )

  // Pinned to the day this view mounted; a fresh Date every render would keep
  // re-running the search for no benefit.
  const referenceDate = useMemo(() => today ?? new Date(), [today])

  const { todays, upcoming } = useMemo(() => {
    const all = findAnniversaries(people, relationships, referenceDate, {
      withinDays: windowDays,
    })
    return {
      todays: all.filter((a) => a.daysUntil === 0),
      upcoming: all.filter((a) => a.daysUntil > 0),
    }
  }, [people, relationships, referenceDate])

  function show(personId: string) {
    requestCenter(personNodeId(personId))
    setView("tree")
  }

  if (stats.peopleCount === 0) {
    return (
      <>
        <MobileScreenHeader title="Insights" detail={tree.name} />
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-sm text-center text-13 text-muted-foreground">
            Nothing to summarise yet — add people to {tree.name} and their
            statistics will appear here.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <MobileScreenHeader title="Insights" detail={tree.name} />
      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-6 max-md:gap-6 max-md:p-4">
        <section className="flex flex-col gap-2">
          <SectionHeading className="max-md:hidden">{tree.name}</SectionHeading>
          {/* A wrapping row of four tiles leaves an orphan on a phone; a
            two-column grid keeps them paired. */}
          <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-border p-3 max-md:grid max-md:grid-cols-2 max-md:gap-4 max-md:p-4">
            <Tile value={stats.peopleCount} label="people" />
            <Tile value={stats.generations.length} label="generations" />
            <Tile
              value={stats.averageLifespan}
              label="average lifespan"
              suffix=" yrs"
            />
            <Tile
              value={
                stats.earliestBirthYear !== undefined &&
                stats.latestBirthYear !== undefined
                  ? `${stats.earliestBirthYear}–${stats.latestBirthYear}`
                  : undefined
              }
              label="birth years"
            />
          </div>
          <p className="text-12-5 leading-relaxed text-muted-foreground">
            Scoped to the tree that is open, not the whole pool — the pool can
            hold several unrelated families.{" "}
            {stats.lifespanSampleSize > 0
              ? `The average lifespan is drawn from the ${stats.lifespanSampleSize} ${
                  stats.lifespanSampleSize === 1 ? "person" : "people"
                } with both a birth and a death year recorded.`
              : "No lifespan average yet — nobody has both a birth and a death year recorded."}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <SectionHeading>
              {todays.length > 0 ? "Today" : "Coming up"}
            </SectionHeading>
            <span className="text-11 text-muted-foreground">
              {anniversaryWindowLabel(windowDays)}
            </span>
            <div className="ml-auto flex gap-1 max-md:ml-0">
              {ANNIVERSARY_WINDOWS.map((option) => (
                <Button
                  key={option.days}
                  variant={windowDays === option.days ? "secondary" : "ghost"}
                  size="xs"
                  aria-pressed={windowDays === option.days}
                  onClick={() => setWindowDays(option.days)}
                >
                  {option.days === 365
                    ? "1y"
                    : `${Math.round(option.days / 31)}m`}
                </Button>
              ))}
            </div>
          </div>
          {todays.length + upcoming.length === 0 ? (
            <div className="flex flex-col items-start gap-2.5 border border-border p-3">
              <p className="text-13 text-muted-foreground">
                Nothing in the {anniversaryWindowLabel(windowDays)}. Only exact
                dates count — a bare year, or one recorded as approximate, has
                no day to fall on.
              </p>
              {/* The obvious next question when a window comes back empty is
                  whether a wider one wouldn't. */}
              {windowDays !== 365 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWindowDays(365)}
                >
                  Widen to a year
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {(todays.length > 0 ? todays : upcoming).map(
                (anniversary, index) => (
                  <AnniversaryRow
                    key={`${anniversary.kind}:${anniversary.personIds.join(",")}:${index}`}
                    anniversary={anniversary}
                    onShow={show}
                  />
                )
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <SectionHeading>Superlatives</SectionHeading>
          <div className="flex flex-col">
            <SuperlativeRow
              title="Longest life"
              entry={stats.longestLife}
              unit="years"
              onShow={show}
            />
            <SuperlativeRow
              title="Most children"
              entry={stats.mostChildren}
              unit="children"
              onShow={show}
            />
            <SuperlativeRow
              title="Largest sibling group"
              entry={stats.largestSiblingGroup}
              unit="siblings"
              onShow={show}
            />
            <SuperlativeRow
              title="Longest marriage"
              entry={stats.longestMarriage}
              unit="years"
              onShow={show}
            />
          </div>
        </section>

        <div className="flex flex-wrap gap-7 max-md:gap-6">
          <section className="flex min-w-56 flex-1 flex-col gap-2">
            <SectionHeading>Generations</SectionHeading>
            <BarList
              rows={stats.generations.map((row) => ({
                key: String(row.generation),
                label: `Generation ${row.generation + 1}`,
                count: row.count,
              }))}
              total={stats.peopleCount}
            />
          </section>

          <section className="flex min-w-56 flex-1 flex-col gap-2">
            <SectionHeading>Sex</SectionHeading>
            <BarList
              rows={SEX_ROWS.map(({ key, label }) => ({
                key,
                label,
                count: stats.sexCounts[key],
              })).filter((row) => row.count > 0)}
              total={stats.peopleCount}
            />
          </section>
        </div>

        {stats.surnames.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHeading>Surnames</SectionHeading>
            <BarList
              rows={stats.surnames.slice(0, 8).map((row) => ({
                key: row.surname,
                label: row.surname,
                count: row.count,
              }))}
              total={stats.peopleCount}
            />
            {stats.surnames.length > 8 && (
              <p className="text-11 text-muted-foreground">
                {stats.surnames.length - 8} more not shown.
              </p>
            )}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <SectionHeading>Recorded detail</SectionHeading>
          <div className="flex flex-col">
            <DetailRow
              label="Birth year recorded"
              value={`${stats.withBirthYear} of ${stats.peopleCount}`}
            />
            <DetailRow
              label="Placeholders still unresolved"
              value={String(stats.placeholderCount)}
            />
          </div>
        </section>
      </div>
    </>
  )
}

const SEX_ROWS: Array<{ key: keyof Statistics["sexCounts"]; label: string }> = [
  { key: "female", label: "Female" },
  { key: "male", label: "Male" },
  { key: "other", label: "Other" },
  { key: "unrecorded", label: "Not recorded" },
]

function Tile({
  value,
  label,
  suffix = "",
}: {
  value: number | string | undefined
  label: string
  suffix?: string
}) {
  const shown =
    value === undefined
      ? "—"
      : typeof value === "number"
        ? `${Math.round(value)}${suffix}`
        : value
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-heading text-xl font-semibold">{shown}</span>
      <span className="font-heading text-10 font-semibold text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function anniversaryText(anniversary: Anniversary): string {
  const { kind, yearsAgo, deceased } = anniversary
  if (kind === "marriage") {
    return yearsAgo !== undefined
      ? `${yearsAgo} years married`
      : "Wedding anniversary"
  }
  if (kind === "death") {
    return yearsAgo !== undefined
      ? `Died ${yearsAgo} ${yearsAgo === 1 ? "year" : "years"} ago`
      : "Anniversary of their death"
  }
  if (yearsAgo === undefined) return "Birthday"
  // With no "living" flag, a recorded death is the only thing that separates
  // these two — and either one used in the wrong place reads badly.
  return deceased ? `Would have turned ${yearsAgo}` : `Turns ${yearsAgo}`
}

function AnniversaryRow({
  anniversary,
  onShow,
}: {
  anniversary: Anniversary
  onShow: (personId: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-b-0 border-border p-3 last:border-b">
      <span className="w-18 shrink-0 font-heading text-10 font-semibold text-muted-foreground">
        {anniversary.daysUntil === 0 ? "Today" : `In ${anniversary.daysUntil}d`}
      </span>
      <span className="min-w-0 flex-1 text-13">
        <span className="font-medium">{anniversary.label}</span>
        {" — "}
        {anniversaryText(anniversary)}
      </span>
      <div className="ml-auto flex shrink-0 gap-1">
        {anniversary.personIds.map((personId) => (
          <Button
            key={personId}
            variant="outline"
            size="xs"
            onClick={() => onShow(personId)}
          >
            Show
          </Button>
        ))}
      </div>
    </div>
  )
}

function SuperlativeRow({
  title,
  entry,
  unit,
  onShow,
}: {
  title: string
  entry: NamedValue | undefined
  unit: string
  onShow: (personId: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-b-0 border-border p-3 last:border-b">
      <span className="font-heading text-10 font-semibold text-muted-foreground">
        {title}
      </span>
      {entry ? (
        <>
          <span className="text-13">
            {entry.label} · {entry.value} {unit}
          </span>
          <div className="ml-auto flex shrink-0 gap-1">
            {entry.personIds.slice(0, 3).map((personId) => (
              <Button
                key={personId}
                variant="outline"
                size="xs"
                onClick={() => onShow(personId)}
              >
                Show
              </Button>
            ))}
          </div>
        </>
      ) : (
        <span className="text-13 text-muted-foreground">
          Not enough recorded to say.
        </span>
      )}
    </div>
  )
}

function BarList({
  rows,
  total,
}: {
  rows: Array<{ key: string; label: string; count: number }>
  total: number
}) {
  const max = Math.max(1, ...rows.map((row) => row.count))
  return (
    <div className="flex flex-col gap-1.5">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing recorded.</p>
      )}
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <span className="w-30 shrink-0 truncate text-11">{row.label}</span>
          {/* Bars are scaled against the largest row so small differences stay
              readable; the count beside each one carries the real value. */}
          <span className="h-2 min-w-px flex-1 bg-muted">
            <span
              className="block h-full bg-primary"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-11 text-muted-foreground max-md:w-12">
            {row.count}
            {total > 0 && ` · ${Math.round((row.count / total) * 100)}%`}
          </span>
        </div>
      ))}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border border-b-0 border-border p-3 last:border-b">
      <span className="text-13">{label}</span>
      <span className="ml-auto font-heading text-13 font-semibold">
        {value}
      </span>
    </div>
  )
}
