// A snapshot's usefulness is entirely about how long ago it was, so "4 minutes
// ago" answers the question and "01/09/2026, 12:04:31" makes the reader do
// arithmetic. Past the point where that stops being true — roughly a day — an
// absolute date is the clearer answer, so this hands back undefined and lets the
// caller fall back to toLocaleString.
//
// `now` is a parameter rather than a call to the clock, per the convention in
// the analysis modules, so the output can be pinned in a test.
const DIVISIONS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: "second", ms: 1000 },
  { unit: "minute", ms: 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
]

const DAY_MS = 24 * 60 * 60 * 1000

export function formatTimeAgo(
  then: number,
  now: number = Date.now()
): string | undefined {
  const elapsed = now - then
  // A future timestamp means a clock change or a file from another machine.
  // Saying "in 3 hours" about a local snapshot would just look broken.
  if (elapsed < 0 || elapsed >= DAY_MS) return undefined

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  let division = DIVISIONS[0]
  for (const candidate of DIVISIONS) {
    if (elapsed >= candidate.ms) division = candidate
  }
  return formatter.format(-Math.floor(elapsed / division.ms), division.unit)
}

// The line the UI actually renders: relative while that is the more useful
// reading, absolute once it isn't.
export function formatWhen(then: number, now: number = Date.now()): string {
  return formatTimeAgo(then, now) ?? new Date(then).toLocaleString()
}
