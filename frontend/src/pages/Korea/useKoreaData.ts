import { useEffect, useState } from "react"
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
  const [state, setState] = useState<LoadState<DayDetailResponse>>({
    status: "loading",
    data: null,
    error: null,
  })

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setState({ status: "loading", data: null, error: null })

    fetch(`/api/korea/day/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Day fetch failed: ${res.status}`)
        return res.json() as Promise<DayDetailResponse>
      })
      .then((data) => {
        if (!cancelled) setState({ status: "success", data, error: null })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: "error", data: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  return state
}
