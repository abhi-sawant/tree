import { describe, expect, it, vi } from "vitest"

import { createChangeScheduler } from "~/lib/backup/schedule"

// A hand-driven clock: the scheduler is handed setTimer/clearTimer so the tests
// decide exactly when a debounce window elapses.
function fakeTimers() {
  let next = 1
  const queued = new Map<number, () => void>()
  return {
    setTimer: (callback: () => void) => {
      const handle = next++
      queued.set(handle, callback)
      return handle
    },
    clearTimer: (handle: unknown) => {
      queued.delete(handle as number)
    },
    // Fires everything currently queued.
    async tick() {
      const callbacks = [...queued.values()]
      queued.clear()
      for (const callback of callbacks) callback()
      await Promise.resolve()
      await Promise.resolve()
    },
    size: () => queued.size,
  }
}

describe("createChangeScheduler", () => {
  it("coalesces a burst of requests into one run", async () => {
    const timers = fakeTimers()
    const run = vi.fn()
    const scheduler = createChangeScheduler({ delayMs: 10, run, ...timers })

    for (let i = 0; i < 50; i++) scheduler.request()
    expect(run).not.toHaveBeenCalled()

    await timers.tick()

    expect(run).toHaveBeenCalledOnce()
  })

  it("does nothing without a request", async () => {
    const timers = fakeTimers()
    const run = vi.fn()
    createChangeScheduler({ delayMs: 10, run, ...timers })

    await timers.tick()

    expect(run).not.toHaveBeenCalled()
  })

  it("runs again for a request made after the first run finished", async () => {
    const timers = fakeTimers()
    const run = vi.fn()
    const scheduler = createChangeScheduler({ delayMs: 10, run, ...timers })

    scheduler.request()
    await timers.tick()
    scheduler.request()
    await timers.tick()

    expect(run).toHaveBeenCalledTimes(2)
  })

  it("picks up a change that lands mid-run instead of losing it", async () => {
    const timers = fakeTimers()
    let release: (() => void) | undefined
    const run = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockImplementation(() => Promise.resolve())
    const scheduler = createChangeScheduler({ delayMs: 10, run, ...timers })

    scheduler.request()
    await timers.tick()
    expect(scheduler.isRunning()).toBe(true)

    // Arrives while the first run is still in flight.
    scheduler.request()
    expect(timers.size()).toBe(0) // no overlapping timer was started
    release!()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(run).toHaveBeenCalledTimes(2)
  })

  it("reports a failing run to onError and keeps working afterwards", async () => {
    const timers = fakeTimers()
    const onError = vi.fn()
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("quota exceeded"))
      .mockResolvedValue(undefined)
    const scheduler = createChangeScheduler({
      delayMs: 10,
      run,
      onError,
      ...timers,
    })

    scheduler.request()
    await timers.tick()

    expect(onError).toHaveBeenCalledWith(new Error("quota exceeded"))
    expect(scheduler.isRunning()).toBe(false)

    scheduler.request()
    await timers.tick()

    expect(run).toHaveBeenCalledTimes(2)
  })

  it("flush runs a pending request immediately, without waiting for the timer", async () => {
    const timers = fakeTimers()
    const run = vi.fn()
    const scheduler = createChangeScheduler({ delayMs: 10, run, ...timers })

    scheduler.request()
    await scheduler.flush()

    expect(run).toHaveBeenCalledOnce()
    // The debounce timer was dropped, so ticking must not run it a second time.
    await timers.tick()
    expect(run).toHaveBeenCalledOnce()
  })

  it("flush is a no-op with nothing pending", async () => {
    const timers = fakeTimers()
    const run = vi.fn()
    const scheduler = createChangeScheduler({ delayMs: 10, run, ...timers })

    await scheduler.flush()

    expect(run).not.toHaveBeenCalled()
  })

  it("cancel drops a pending request", async () => {
    const timers = fakeTimers()
    const run = vi.fn()
    const scheduler = createChangeScheduler({ delayMs: 10, run, ...timers })

    scheduler.request()
    expect(scheduler.isPending()).toBe(true)
    scheduler.cancel()
    await timers.tick()

    expect(scheduler.isPending()).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it("defaults to real timers when none are injected", async () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const scheduler = createChangeScheduler({ delayMs: 50, run })

    scheduler.request()
    scheduler.request()
    await vi.advanceTimersByTimeAsync(49)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(run).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
