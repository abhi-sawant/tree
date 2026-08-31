import type { PartialDate } from "~/lib/types"

const GEDCOM_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const

function titleCaseMonth(month: number): string {
  const code = GEDCOM_MONTHS[month - 1]
  return code[0] + code.slice(1).toLowerCase()
}

export function formatPartialDate(pd?: PartialDate): string {
  if (!pd || pd.year === undefined) return ""

  let result: string
  if (pd.month === undefined) {
    result = String(pd.year)
  } else if (pd.day === undefined) {
    result = `${titleCaseMonth(pd.month)} ${pd.year}`
  } else {
    result = `${pd.day} ${titleCaseMonth(pd.month)} ${pd.year}`
  }

  return pd.approximate ? `c. ${result}` : result
}

function sortKey(pd?: PartialDate): number | undefined {
  if (!pd || pd.year === undefined) return undefined
  const month = pd.month ?? 1
  const day = pd.day ?? 1
  return pd.year * 372 + (month - 1) * 31 + (day - 1)
}

export function comparePartialDate(a?: PartialDate, b?: PartialDate): number {
  const ka = sortKey(a)
  const kb = sortKey(b)

  if (ka === undefined && kb === undefined) return 0
  if (ka === undefined) return 1
  if (kb === undefined) return -1
  return ka - kb
}

// sortKey's pseudo-calendar: 31 slots per month, 12 months per year. It only
// ever has to order dates and measure gaps in whole-ish years, so the fiction
// of uniform month lengths costs nothing and keeps the arithmetic exact.
const DAYS_PER_MONTH = 31
const DAYS_PER_YEAR = 372

// How far either way a "c. 1890" is allowed to actually be. Generous on
// purpose: a circa date should never be the thing that makes the app accuse
// someone's family of a contradiction.
export const APPROXIMATE_MARGIN_YEARS = 2

export interface DateBounds {
  earliest: number
  latest: number
}

// A PartialDate denotes a span, not an instant: "1950" is the whole of 1950,
// "Mar 1950" the whole of that month. Everything that reasons about whether one
// date precedes another has to work in spans, or a bare year silently becomes 1
// January and the app starts reporting contradictions the data never stated.
//
// Note this is deliberately NOT what comparePartialDate does — that one is for
// sorting, where collapsing a year to its first day is the right call and an
// unknown date sorting last is useful. Using it to decide a fact would be a bug.
export function dateBounds(pd?: PartialDate): DateBounds | undefined {
  if (!pd || pd.year === undefined) return undefined

  const monthKnown = pd.month !== undefined
  const dayKnown = monthKnown && pd.day !== undefined
  const start =
    pd.year * DAYS_PER_YEAR +
    ((pd.month ?? 1) - 1) * DAYS_PER_MONTH +
    ((pd.day ?? 1) - 1)
  const span = dayKnown
    ? 0
    : monthKnown
      ? DAYS_PER_MONTH - 1
      : DAYS_PER_YEAR - 1
  const margin = pd.approximate ? APPROXIMATE_MARGIN_YEARS * DAYS_PER_YEAR : 0

  return { earliest: start - margin, latest: start + span + margin }
}

// True only when every instant `a` could mean falls before every instant `b`
// could. Overlapping spans — and any unknown date — answer false: an
// undecidable comparison must never be reported as a finding.
export function definitelyBefore(a?: PartialDate, b?: PartialDate): boolean {
  const boundsA = dateBounds(a)
  const boundsB = dateBounds(b)
  if (!boundsA || !boundsB) return false
  return boundsA.latest < boundsB.earliest
}

// The smallest gap in years that could separate `a` from `b`, negative when `b`
// might precede `a`. Undefined when either date is unknown.
export function minimumYearsBetween(
  a?: PartialDate,
  b?: PartialDate
): number | undefined {
  const boundsA = dateBounds(a)
  const boundsB = dateBounds(b)
  if (!boundsA || !boundsB) return undefined
  return (boundsB.earliest - boundsA.latest) / DAYS_PER_YEAR
}

// The largest gap in years that could separate `a` from `b`. Undefined when
// either date is unknown.
export function maximumYearsBetween(
  a?: PartialDate,
  b?: PartialDate
): number | undefined {
  const boundsA = dateBounds(a)
  const boundsB = dateBounds(b)
  if (!boundsA || !boundsB) return undefined
  return (boundsB.latest - boundsA.earliest) / DAYS_PER_YEAR
}

export function partialDateToGedcomDate(pd?: PartialDate): string {
  if (!pd || pd.year === undefined) return ""

  let result: string
  if (pd.month === undefined) {
    result = String(pd.year)
  } else if (pd.day === undefined) {
    result = `${GEDCOM_MONTHS[pd.month - 1]} ${pd.year}`
  } else {
    result = `${pd.day} ${GEDCOM_MONTHS[pd.month - 1]} ${pd.year}`
  }

  return pd.approximate ? `ABT ${result}` : result
}
