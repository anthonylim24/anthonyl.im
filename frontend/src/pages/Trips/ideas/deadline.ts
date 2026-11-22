// One AbortSignal for "the caller hung up, or the deadline passed", that can
// also say which of the two it was. `AbortSignal.any` would combine them but
// throws on Safari before 17.4 (iOS 16), which would fail every lookup there;
// and `AbortSignal.timeout` gives no way to tell a slow server from a caller
// that left. A plain AbortController does both, everywhere.

export interface Deadline {
  /** Aborts when `parent` does or `ms` pass, whichever comes first. */
  signal: AbortSignal
  /** True when it was the deadline, not the caller, that ended it. */
  timedOut: () => boolean
  /** Stop the clock and stop listening to `parent`. Call once the work settles. */
  release: () => void
}

export function withDeadline(parent: AbortSignal | undefined, ms: number): Deadline {
  const controller = new AbortController()
  let late = false
  const onAbort = () => controller.abort()
  const timer = setTimeout(() => {
    late = true
    controller.abort()
  }, ms)
  if (parent?.aborted) controller.abort()
  else parent?.addEventListener("abort", onAbort, { once: true })
  return {
    signal: controller.signal,
    timedOut: () => late,
    release: () => {
      clearTimeout(timer)
      parent?.removeEventListener("abort", onAbort)
    },
  }
}
