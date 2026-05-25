import { useEffect, useRef, useState } from "react"
import type { Snapshot, DayDetailResponse } from "./types"

// Module-level cache so navigating /korea ↔ /korea/day/:slug doesn't re-fetch.
let snapshotCache: Snapshot | null = null
let snapshotPromise: Promise<Snapshot> | null = null

function fetchSnapshotOnce(): Promise<Snapshot> {
  if (snapshotCache) return Promise.resolve(snapshotCache)
  if (snapshotPromise) return snapshotPromise

  snapshotPromise = fetch("/api/korea")
    .then((res) => {
      if (!res.ok) throw new Error(`Korea snapshot fetch failed: ${res.status}`)
      return res.json() as Promise<Snapshot>
    })
    .then((data) => {
      snapshotCache = data
      return data
    })
    .finally(() => {
      snapshotPromise = null
    })

  return snapshotPromise
}

// Module-level cache for day detail responses — prevents re-fetching (and
// skeleton flashes) when navigating back to a previously loaded day page.
const dayCache = new Map<string, DayDetailResponse>()

function getInitialDayState(slug: string | undefined): LoadState<DayDetailResponse> {
  if (slug && dayCache.has(slug)) {
    return { status: "success", data: dayCache.get(slug)!, error: null }
  }
  return { status: "loading", data: null, error: null }
}

export type LoadState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: Error }

export function useKoreaSnapshot(): LoadState<Snapshot> {
  const [state, setState] = useState<LoadState<Snapshot>>(() =>
    snapshotCache
      ? { status: "success", data: snapshotCache, error: null }
      : { status: "loading", data: null, error: null },
  )

  useEffect(() => {
    if (snapshotCache) return

    let cancelled = false
    fetchSnapshotOnce()
      .then((data) => {
        if (!cancelled) setState({ status: "success", data, error: null })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: "error", data: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function useKoreaDay(slug: string | undefined): LoadState<DayDetailResponse> {
  const [state, setState] = useState<LoadState<DayDetailResponse>>(() => getInitialDayState(slug))
  // Track which slug the committed state belongs to so we can return a
  // synchronous cache derivation in the brief window between a slug change
  // and the effect running (avoids stale-previous-day content flash).
  const stateSlugRef = useRef(slug)

  useEffect(() => {
    if (!slug) return
    stateSlugRef.current = slug

    if (dayCache.has(slug)) {
      // Cache hit — hydrate immediately without the loading skeleton.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "success", data: dayCache.get(slug)!, error: null })
      return
    }

    let cancelled = false
    setState({ status: "loading", data: null, error: null })

    fetch(`/api/korea/day/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Day fetch failed: ${res.status}`)
        return res.json() as Promise<DayDetailResponse>
      })
      .then((data) => {
        dayCache.set(slug, data)
        if (!cancelled) setState({ status: "success", data, error: null })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: "error", data: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  // Slug changed but effect hasn't run yet — derive synchronously from cache
  // so we don't briefly flash the previous day's content.
  // eslint-disable-next-line react-hooks/refs
  if (stateSlugRef.current !== slug) {
    return getInitialDayState(slug)
  }

  return state
}
