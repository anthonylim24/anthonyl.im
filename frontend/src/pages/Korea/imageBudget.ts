// Dev-mode image budget monitor.
//
// Every photo URL we hand to <img> or three.js's TextureLoader flows
// through `lookupPhoto` / `lookupGooglePlacePhoto`, both of which now
// cap the requested width server-side. To catch regressions — a future
// caller that forgets to pass `size`, an upstream API change that
// stops respecting the cap — we attach a PerformanceObserver that
// emits a console.warn whenever a resource with `initiatorType: img`
// transfers more than the 1 MB budget.
//
// The observer only runs in development. Production builds get a no-op
// so the byte cost stays at zero.

const ONE_MB = 1024 * 1024

let started = false

export function startImageBudgetMonitor(maxBytes: number = ONE_MB): () => void {
  if (started) return () => undefined
  if (typeof window === "undefined") return () => undefined
  if (!import.meta.env.DEV) return () => undefined
  if (typeof PerformanceObserver === "undefined") return () => undefined

  started = true

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const resource = entry as PerformanceResourceTiming
      if (resource.initiatorType !== "img") continue
      // `transferSize` is 0 when the response comes from cache; treat
      // that as "no new bytes" and skip. `encodedBodySize` is the
      // payload bytes the server actually sent for non-cached hits.
      const bytes = resource.transferSize > 0 ? resource.transferSize : resource.encodedBodySize
      if (bytes > maxBytes) {
        console.warn(
          `[korea] image exceeds ${(maxBytes / 1024).toFixed(0)} KB budget: ${(bytes / 1024).toFixed(1)} KB — ${resource.name}`,
        )
      }
    }
  })

  try {
    observer.observe({ type: "resource", buffered: true })
  } catch {
    /* older browsers without buffered support */
    observer.observe({ entryTypes: ["resource"] })
  }

  return () => {
    observer.disconnect()
    started = false
  }
}
