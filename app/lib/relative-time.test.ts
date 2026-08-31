import { describe, expect, it } from "vitest"

import { formatTimeAgo, formatWhen } from "~/lib/relative-time"

const NOW = new Date("2026-09-01T12:00:00.000Z").getTime()
const ago = (ms: number) => NOW - ms

describe("formatTimeAgo", () => {
  it("counts in seconds under a minute", () => {
    expect(formatTimeAgo(ago(0), NOW)).toBe("now")
    expect(formatTimeAgo(ago(30_000), NOW)).toBe("30 seconds ago")
  })

  it("counts in minutes under an hour", () => {
    expect(formatTimeAgo(ago(60_000), NOW)).toBe("1 minute ago")
    expect(formatTimeAgo(ago(59 * 60_000), NOW)).toBe("59 minutes ago")
  })

  it("counts in hours under a day", () => {
    expect(formatTimeAgo(ago(60 * 60_000), NOW)).toBe("1 hour ago")
    expect(formatTimeAgo(ago(23 * 60 * 60_000), NOW)).toBe("23 hours ago")
  })

  it("truncates rather than rounds, so nothing reads as older than it is", () => {
    expect(formatTimeAgo(ago(119_000), NOW)).toBe("1 minute ago")
  })

  it("gives up past a day, where an absolute date reads better", () => {
    expect(formatTimeAgo(ago(24 * 60 * 60_000), NOW)).toBeUndefined()
  })

  it("gives up on a future timestamp rather than saying 'in 3 hours'", () => {
    expect(formatTimeAgo(NOW + 10_000, NOW)).toBeUndefined()
  })
})

describe("formatWhen", () => {
  it("uses the relative form while it is useful", () => {
    expect(formatWhen(ago(120_000), NOW)).toBe("2 minutes ago")
  })

  it("falls back to an absolute date once it isn't", () => {
    const old = new Date("2026-08-01T09:30:00.000Z").getTime()
    expect(formatWhen(old, NOW)).toBe(new Date(old).toLocaleString())
  })
})
