import { useMemo, useState } from "react"

import { MergePeopleDialog } from "~/components/people/merge-people-dialog"
import { Button } from "~/components/ui/button"
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
import { useCanvasUIStore } from "~/lib/canvas/canvas-ui-store"
import { useMembers } from "~/lib/db/hooks"
import { personNodeId } from "~/lib/graph/node-ids"
import { personDisplayName } from "~/lib/person-name"
import { useAppShellStore } from "~/lib/ui/app-shell-store"
import type { Person, Relationship } from "~/lib/types"

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

  const findings = useMemo(
    () =>
      memberships
        ? validate({ people, relationships, memberships })
        : undefined,
    [people, relationships, memberships]
  )

  const duplicates = useMemo(
    () => findDuplicates(people, relationships),
    [people, relationships]
  )

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
      <div className="flex flex-1 items-center justify-center">
        <p className="text-13 font-medium text-muted-foreground">Checking…</p>
      </div>
    )
  }

  const counts = countBySeverity(findings)
  const errors = findings.filter((f) => f.severity === "error")
  const warnings = findings.filter((f) => f.severity === "warning")

  return (
    <div className="flex max-w-175 flex-1 flex-col gap-7 overflow-y-auto p-6">
      <section className="flex flex-col gap-2">
        <SectionHeading>Summary</SectionHeading>
        <div className="flex items-center gap-4 border border-border p-3">
          <Tally severity="error" count={counts.error} />
          <Tally severity="warning" count={counts.warning} />
          <Tally severity="duplicate" count={duplicates.length} />
          <span className="ml-auto text-xs text-muted-foreground">
            {people.length} {people.length === 1 ? "person" : "people"} checked
          </span>
        </div>
        <p className="text-12-5 leading-relaxed text-muted-foreground">
          Errors are contradictions the data cannot be right about. Warnings are
          gaps worth filling in. Nothing is reported unless the recorded dates
          settle it — a bare year is treated as the whole year, so an
          undecidable comparison stays quiet.
        </p>
      </section>

      {findings.length === 0 && duplicates.length === 0 && (
        <p className="border border-border p-4 text-13">
          Nothing to report. Every recorded date is consistent, every person has
          a birth year and a tree, and no two records look like the same person.
        </p>
      )}

      {errors.length > 0 && (
        <FindingSection
          title="Errors"
          findings={errors}
          people={people}
          memberIds={memberIds}
          onShow={show}
        />
      )}
      {warnings.length > 0 && (
        <FindingSection
          title="Warnings"
          findings={warnings}
          people={people}
          memberIds={memberIds}
          onShow={show}
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
          <div className="flex flex-col">
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
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FindingSection({
  title,
  findings,
  people,
  memberIds,
  onShow,
}: {
  title: string
  findings: Finding[]
  people: Person[]
  memberIds: Set<string>
  onShow: (personId: string) => void
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
      <div className="flex flex-col">
        {findings.map((finding, index) => (
          <div
            key={`${finding.code}:${finding.personIds.join(",")}:${index}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-b-0 border-border p-3 last:border-b"
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
            <div className="flex shrink-0 items-center gap-1">
              {finding.personIds.map((personId) => {
                const person = peopleById.get(personId)
                if (!person) return null
                if (!memberIds.has(personId)) {
                  return (
                    <span
                      key={personId}
                      className="px-1.5 text-11 text-muted-foreground"
                      title="Not a member of the tree that is open"
                    >
                      {personDisplayName(person)}
                    </span>
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
}: {
  candidate: DuplicateCandidate
  memberIds: Set<string>
  onShow: (personId: string) => void
  onMerge: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 border border-b-0 border-border p-3 last:border-b">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 text-13">
          <span className="font-medium">{candidate.labels[0]}</span>
          {" and "}
          <span className="font-medium">{candidate.labels[1]}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
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
      <span className="font-heading text-10 font-semibold tracking-widest text-muted-foreground uppercase">
        {count === 1 ? singular : plural}
      </span>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-xs font-semibold tracking-widest uppercase">
      {children}
    </h2>
  )
}
