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
