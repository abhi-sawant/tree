import { useMemo } from "react"

import { Button } from "~/components/ui/button"
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

      {findings.length === 0 && (
        <p className="border border-border p-4 text-13">
          Nothing to report. Every recorded date is consistent, and every person
          has a birth year and a tree.
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

function Tally({ severity, count }: { severity: Severity; count: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-heading text-lg font-semibold">{count}</span>
      <span className="font-heading text-10 font-semibold tracking-widest text-muted-foreground uppercase">
        {severity === "error"
          ? count === 1
            ? "error"
            : "errors"
          : count === 1
            ? "warning"
            : "warnings"}
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
