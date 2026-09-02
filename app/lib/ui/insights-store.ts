import { create } from "zustand"
import { persist } from "zustand/middleware"

// How far ahead the anniversaries list looks. Its own persisted store rather
// than a local useState because it is a reading preference — someone who
// widened it to a year meant "this is how I want to read this page", not "just
// this once", and losing it on every reload would make the control feel like
// it did nothing.
//
// Not folded into the appearance store: that one is about how the canvas is
// drawn, and a window of days is not a display setting.
export const INSIGHTS_STORAGE_KEY = "familytree:insights"

// A month, two months, or the year. The month default is what the page shipped
// with; the year is the widest window where "upcoming" still means anything.
export const ANNIVERSARY_WINDOWS = [
  { days: 31, label: "next month" },
  { days: 62, label: "next two months" },
  { days: 365, label: "next year" },
] as const

export type AnniversaryWindowDays = (typeof ANNIVERSARY_WINDOWS)[number]["days"]

interface InsightsState {
  anniversaryWindowDays: AnniversaryWindowDays
  setAnniversaryWindowDays: (days: AnniversaryWindowDays) => void
}

export const useInsightsStore = create<InsightsState>()(
  persist(
    (set) => ({
      anniversaryWindowDays: 31,
      setAnniversaryWindowDays: (anniversaryWindowDays) =>
        set({ anniversaryWindowDays }),
    }),
    { name: INSIGHTS_STORAGE_KEY }
  )
)

export function anniversaryWindowLabel(days: number): string {
  return (
    ANNIVERSARY_WINDOWS.find((window) => window.days === days)?.label ??
    `next ${days} days`
  )
}
