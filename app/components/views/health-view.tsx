import { useEffect, useMemo, useState } from "react"

import { MergePeopleDialog } from "~/components/people/merge-people-dialog"
import { Button } from "~/components/ui/button"
import { MobileScreenHeader } from "~/components/shell/mobile-screen-header"
import { SectionHeading } from "~/components/ui/section-heading"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  findDuplicates,
  type DuplicateCandidate,
} from "~/lib/analysis/duplicates"
import {
  countBySeverity,
  validate,
  type Finding,
  type Severity,
} from "~/lib/analysis/validate"
import {
  duplicateKey,
  duplicatePersonIds,
  filterDismissed,
  findingKey,
  findingPersonIds,
} from "~/lib/analysis/dismissals"
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { dismiss, undismiss } from "~/lib/db/dismissals"
import { useDismissals, useMembers } from "~/lib/db/hooks"
import { personNodeId } from "~/lib/graph/node-ids"
import { personDisplayName } from "~/lib/person-name"
import { formatWhen } from "~/lib/relative-time"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import { toast } from "~/lib/ui/toast-store"
import type { Dismissal, Person, Relationship } from "~/lib/types"

interface HealthViewProps {
  people: Person[]
  relationships: Relationship[]
  // Members of the tree currently open — only they can actually be shown on
  // the canvas, so only they get a jump-to action.
  memberIds: Set<string>
}

export function HealthView({
  people,
  relationships,
  memberIds,
}: HealthViewProps) {
  const memberships = useMembers()
  const setView = useAppShellStore((s) => s.setView)
  const requestCenter = useCanvasUIStore((s) => s.requestCenter)
  const dismissals = useDismissals()
  const dismissedKeys = useMemo(
    () => new Set((dismissals ?? []).map((row) => row.key)),
    [dismissals]
  )

  // The checks run off live queries, so they are already up to date whenever
  // the data changes — there is nothing for a "re-check" button to trigger.
  // What it can honestly do is say when the answer on screen was computed, and
  // recompute it on demand so that stamp moves. See the note on the button.
  const [checkedAt, setCheckedAt] = useState(() => Date.now())

  const allFindings = useMemo(
    () =>
      memberships
        ? validate({ people, relationships, memberships })
        : undefined,
    [people, relationships, memberships]
  )

  const allDuplicates = useMemo(
    () => findDuplicates(people, relationships),
    [people, relationships]
  )

  // Anything already looked at and rejected drops out. It is not deleted: the
  // "Dismissed" section below lists it and takes it back.
  const findings = useMemo(
    () =>
      allFindings && filterDismissed(allFindings, findingKey, dismissedKeys),
    [allFindings, dismissedKeys]
  )
  const duplicates = useMemo(
    () => filterDismissed(allDuplicates, duplicateKey, dismissedKeys),
    [allDuplicates, dismissedKeys]
  )
  const dismissedCount =
    (allFindings ? allFindings.length - findings!.length : 0) +
    (allDuplicates.length - duplicates.length)

  // Recomputing is what the data already does; the stamp is the honest part.
  useEffect(() => {
    setCheckedAt(Date.now())
  }, [allFindings, allDuplicates])

  async function handleDismissFinding(finding: Finding) {
    await dismiss({
      key: findingKey(finding),
      kind: "finding",
      personIds: findingPersonIds(finding),
    })
    toast("Ignored — reachable under Dismissed")
  }

  async function handleDismissDuplicate(candidate: DuplicateCandidate) {
    await dismiss({
      key: duplicateKey(candidate),
      kind: "duplicate",
      personIds: duplicatePersonIds(candidate),
    })
    toast("Marked as not a duplicate")
  }

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people]
  )
  const [mergePair, setMergePair] = useState<[Person, Person] | undefined>(
    undefined
  )

  function show(personId: string) {
    requestCenter(personNodeId(personId))
    setView("tree")
  }

  if (!findings) {
    return (
      <>
        <MobileScreenHeader title="Health" />
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
          <p className="text-13 font-medium text-muted-foreground">
            Checking {people.length}{" "}
            {people.length === 1 ? "record" : "records"}…
          </p>
          <p className="text-11 text-muted-foreground">
            Dates, then relationships, then duplicates.
          </p>
        </div>
      </>
    )
  }

  const counts = countBySeverity(findings)
  const errors = findings.filter((f) => f.severity === "error")
  const warnings = findings.filter((f) => f.severity === "warning")

  return (
    <>
      <MobileScreenHeader
        title="Health"
        detail={`${counts.error} ${counts.error === 1 ? "error" : "errors"} · ${counts.warning} ${counts.warning === 1 ? "warning" : "warnings"} · ${duplicates.length} ${duplicates.length === 1 ? "duplicate" : "duplicates"}`}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-6 max-md:gap-6 max-md:p-4">
        <section className="flex flex-col gap-2">
          <SectionHeading>Summary</SectionHeading>
          {/* Three tallies plus a count is well over 358px on one line, and
            "possible duplicates" alone is most of it. */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3 shadow-card max-md:gap-x-5 max-md:gap-y-2">
            <Tally severity="error" count={counts.error} />
            <Tally severity="warning" count={counts.warning} />
            <Tally severity="duplicate" count={duplicates.length} />
            <span className="ml-auto text-xs text-muted-foreground max-md:ml-0 max-md:basis-full">
              {people.length} {people.length === 1 ? "person" : "people"}{" "}
              checked {formatWhen(checkedAt)}
            </span>
          </div>
          {/* The checks run off live queries, so they are never stale and this
              button cannot make them fresher. What it does is re-run them and
              move the timestamp — which is the only claim worth offering, since
              a button labelled "re-check" that did nothing would be lying about
              the one thing this view exists to be trusted on. */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="xs"
              onClick={() => setCheckedAt(Date.now())}
            >
              Re-check
            </Button>
            {dismissedCount > 0 && (
              <span className="text-11 text-muted-foreground">
                {dismissedCount} {dismissedCount === 1 ? "item" : "items"}{" "}
                ignored — listed at the bottom.
              </span>
            )}
          </div>
          <p className="text-12-5 leading-relaxed text-muted-foreground">
            Errors are contradictions the data cannot be right about. Warnings
            are gaps worth filling in. Nothing is reported unless the recorded
            dates settle it — a bare year is treated as the whole year, so an
            undecidable comparison stays quiet.
          </p>
        </section>

        {findings.length === 0 && duplicates.length === 0 && (
          <p className="rounded-lg border border-border p-4 text-13">
            Nothing to report. Every recorded date is consistent, every person
            has a birth year and a tree, and no two records look like the same
            person.
          </p>
        )}

        {errors.length > 0 && (
          <FindingSection
            title="Errors"
            findings={errors}
            people={people}
            memberIds={memberIds}
            onShow={show}
            onIgnore={(finding) => void handleDismissFinding(finding)}
          />
        )}
        {warnings.length > 0 && (
          <FindingSection
            title="Warnings"
            findings={warnings}
            people={people}
            memberIds={memberIds}
            onShow={show}
            onIgnore={(finding) => void handleDismissFinding(finding)}
          />
        )}

        {mergePair && (
          <MergePeopleDialog
            open
            onOpenChange={(open) => !open && setMergePair(undefined)}
            person={mergePair[0]}
            other={mergePair[1]}
            onMerged={() => setMergePair(undefined)}
          />
        )}

        {duplicates.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHeading>
              Possible duplicates ({duplicates.length})
            </SectionHeading>
            <p className="text-12-5 leading-relaxed text-muted-foreground">
              People who may have been recorded twice, most likely first. These
              are guesses — there is no identity to match on, so nothing here is
              merged for you.
            </p>
            <div className="flex flex-col gap-2">
              {duplicates.map((candidate) => (
                <DuplicateRow
                  key={candidate.personIds.join(":")}
                  candidate={candidate}
                  memberIds={memberIds}
                  onShow={show}
                  onMerge={() => {
                    const a = peopleById.get(candidate.personIds[0])
                    const b = peopleById.get(candidate.personIds[1])
                    if (a && b) setMergePair([a, b])
                  }}
                  onNotADuplicate={() => void handleDismissDuplicate(candidate)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Everything ignored, and the way back. Dismissing has to be
            reversible and visible: a check the reader silenced months ago and
            cannot find again is a check the app is quietly not doing. */}
        {(dismissals ?? []).length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHeading>
              Dismissed ({(dismissals ?? []).length})
            </SectionHeading>
            <p className="text-12-5 leading-relaxed text-muted-foreground">
              Things you have looked at and decided are fine. They stay out of
              the lists above until you bring one back.
            </p>
            <div className="flex flex-col gap-2">
              {(dismissals ?? []).map((row) => (
                <div
                  key={row.key}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border p-3"
                >
                  <p className="min-w-0 flex-1 text-13 leading-snug">
                    {describeDismissal(row, peopleById)}
                  </p>
                  <span className="text-11 text-muted-foreground">
                    {formatWhen(row.dismissedAt)}
                  </span>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void undismiss(row.key)}
                  >
                    Bring back
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

// A dismissal stores a key, not a sentence — the sentence was generated from
// data that may since have changed. So this says what was dismissed and about
// whom, and does not try to reconstruct the original wording.
function describeDismissal(
  row: Dismissal,
  peopleById: Map<string, Person>
): string {
  const names = row.personIds
    .map((id) => {
      const person = peopleById.get(id)
      return person ? personDisplayName(person) : undefined
    })
    .filter((name): name is string => name !== undefined)
  const who = names.length > 0 ? names.join(" and ") : "someone since deleted"
  return row.kind === "duplicate"
    ? `${who} — not the same person`
    : `A check about ${who}`
}

function FindingSection({
  title,
  findings,
  people,
  memberIds,
  onShow,
  onIgnore,
}: {
  title: string
  findings: Finding[]
  people: Person[]
  memberIds: Set<string>
  onShow: (personId: string) => void
  onIgnore: (finding: Finding) => void
}) {
  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people]
  )

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>
        {title} ({findings.length})
      </SectionHeading>
      <div className="flex flex-col gap-2">
        {findings.map((finding, index) => (
          <div
            key={`${finding.code}:${finding.personIds.join(",")}:${index}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border p-3"
          >
            <span
              className={
                finding.severity === "error"
                  ? "size-2 shrink-0 rounded-full bg-destructive"
                  : "size-2 shrink-0 rounded-full bg-muted-foreground"
              }
            />
            <p className="min-w-0 flex-1 text-13 leading-snug">
              {finding.message}
            </p>
            <div className="flex shrink-0 items-center gap-1 max-md:shrink max-md:flex-wrap">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onIgnore(finding)}
              >
                Ignore
              </Button>
              {finding.personIds.map((personId) => {
                const person = peopleById.get(personId)
                if (!person) return null
                if (!memberIds.has(personId)) {
                  return (
                    <Tooltip key={personId}>
                      <TooltipTrigger
                        render={
                          <span className="px-1.5 text-11 text-muted-foreground">
                            {personDisplayName(person)}
                          </span>
                        }
                      />
                      <TooltipContent>
                        Not a member of the tree that is open
                      </TooltipContent>
                    </Tooltip>
                  )
                }
                return (
                  <Button
                    key={personId}
                    variant="outline"
                    size="xs"
                    onClick={() => onShow(personId)}
                  >
                    {personDisplayName(person)}
                  </Button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function DuplicateRow({
  candidate,
  memberIds,
  onShow,
  onMerge,
  onNotADuplicate,
}: {
  candidate: DuplicateCandidate
  memberIds: Set<string>
  onShow: (personId: string) => void
  onMerge: () => void
  onNotADuplicate: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 text-13">
          <span className="font-medium">{candidate.labels[0]}</span>
          {" and "}
          <span className="font-medium">{candidate.labels[1]}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1 max-md:shrink max-md:flex-wrap">
          {candidate.personIds.map((personId, index) =>
            memberIds.has(personId) ? (
              <Button
                key={personId}
                variant="outline"
                size="xs"
                onClick={() => onShow(personId)}
              >
                Show {index + 1}
              </Button>
            ) : null
          )}
          <Button variant="outline" size="xs" onClick={onMerge}>
            Merge
          </Button>
          <Button variant="ghost" size="xs" onClick={onNotADuplicate}>
            Not a duplicate
          </Button>
        </div>
      </div>
      <p className="text-11 text-muted-foreground">
        {candidate.reasons.join(" · ")}
      </p>
    </div>
  )
}

const TALLY_LABELS: Record<TallyKind, [singular: string, plural: string]> = {
  error: ["error", "errors"],
  warning: ["warning", "warnings"],
  duplicate: ["possible duplicate", "possible duplicates"],
}

type TallyKind = Severity | "duplicate"

function Tally({ severity, count }: { severity: TallyKind; count: number }) {
  const [singular, plural] = TALLY_LABELS[severity]
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-heading text-lg font-semibold">{count}</span>
      <span className="font-heading text-10 font-semibold text-muted-foreground">
        {count === 1 ? singular : plural}
      </span>
    </div>
  )
}
