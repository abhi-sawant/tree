// The change signal fires once per low-level write, so a single transaction can
// produce dozens of notifications and a burst of typing produces hundreds.
// Everything durability-related — writing a snapshot, re-writing the backup
// folder — is far too expensive to do per write, and doing it *during* a burst
// would capture a half-finished edit. This coalesces a burst into one run after
// the writes stop.
//
// Timers are injected so the behaviour can be pinned in tests without relying
// on real time, following the same convention as passing `now` into the
// analysis modules.
export interface ChangeSchedulerOptions {
  delayMs: number
  run: () => Promise<void> | void
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  // A failed snapshot must not take the app down with it, but it also must not
  // vanish — the caller decides how to surface it.
  onError?: (error: unknown) => void
}

export interface ChangeScheduler {
  request: () => void
  // Runs now if anything is pending, skipping the wait. Used when the page is
  // being hidden: a debounce timer that never fires because the tab was closed
  // is a snapshot that was never taken.
  flush: () => Promise<void>
  cancel: () => void
  isPending: () => boolean
  isRunning: () => boolean
}

export function createChangeScheduler(
  options: ChangeSchedulerOptions
): ChangeScheduler {
  const {
    delayMs,
    run,
    setTimer = (callback, ms) => setTimeout(callback, ms),
    clearTimer = (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
    onError,
  } = options

  let timer: unknown
  let pending = false
  let running: Promise<void> | undefined

  function cancel() {
    if (timer !== undefined) {
      clearTimer(timer)
      timer = undefined
    }
    pending = false
  }

  async function execute(): Promise<void> {
    timer = undefined
    if (!pending) return

    // A change that lands mid-run belongs to the *next* run: clearing the flag
    // before running, rather than after, is what makes that change survive.
    pending = false
    running = (async () => {
      try {
        await run()
      } catch (error) {
        onError?.(error)
      }
    })()

    try {
      await running
    } finally {
      running = undefined
    }

    // Something changed while that run was in flight.
    if (pending) {
      cancel()
      pending = true
      await execute()
    }
  }

  return {
    request() {
      pending = true
      // Already running: don't start a timer that would overlap it. execute()
      // re-checks `pending` when it finishes and picks the change up there.
      if (running) return
      if (timer !== undefined) clearTimer(timer)
      timer = setTimer(() => void execute(), delayMs)
    },
    async flush() {
      if (timer !== undefined) {
        clearTimer(timer)
        timer = undefined
      }
      if (running) await running
      await execute()
    },
    cancel,
    isPending: () => pending,
    isRunning: () => running !== undefined,
  }
}
