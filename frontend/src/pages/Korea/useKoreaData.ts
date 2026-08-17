import { useEffect, useRef, useState, useTransition } from "react"
import { Effect } from "effect"
import { fetchApi, parseJson } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { HttpStatusError } from "../../effect/errors"
import type { Snapshot, DayDetailResponse } from "./types"

let snapshotCache: Snapshot | null = null
let snapshotPromise: Promise<Snapshot> | null = null

const fetchSnapshotEffect = Effect.fn("KoreaData.fetchSnapshot")(function* () {
  const res = yield* fetchApi("/api/korea")
  if (!res.ok) {
    return yield* Effect.fail(
      new HttpStatusError({ status: res.status, message: `Korea snapshot fetch failed: ${res.status}` }),
    )
  }
  return yield* parseJson<Snapshot>(res)
})

function fetchSnapshotOnce(): Promise<Snapshot> {
  if (snapshotCache) return Promise.resolve(snapshotCache)
  if (snapshotPromise) return snapshotPromise

  snapshotPromise = runPromise(fetchSnapshotEffect())
    .then((data) => {
      snapshotCache = data
      return data
    })
    .finally(() => {
      snapshotPromise = null
    })

  return snapshotPromise
}

const dayCache = new Map<string, DayDetailResponse>()

const fetchDayEffect = Effect.fn("KoreaData.fetchDay")(function* (slug: string) {
  const res = yield* fetchApi(`/api/korea/day/${encodeURIComponent(slug)}`)
  if (!res.ok) {
    return yield* Effect.fail(new HttpStatusError({ status: res.status, message: `Day fetch failed: ${res.status}` }))
  }
  return yield* parseJson<DayDetailResponse>(res)
})

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
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (snapshotCache) return

    let cancelled = false
    fetchSnapshotOnce()
      .then((data) => {
        if (!cancelled) startTransition(() => setState({ status: "success", data, error: null }))
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: "error", data: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [startTransition])

  return state
}

export function useKoreaDay(slug: string | undefined): LoadState<DayDetailResponse> {
  const [state, setState] = useState<LoadState<DayDetailResponse>>(() => getInitialDayState(slug))
  const stateSlugRef = useRef(slug)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!slug) return
    stateSlugRef.current = slug

    if (dayCache.has(slug)) {
      setState({ status: "success", data: dayCache.get(slug)!, error: null })
      return
    }

    let cancelled = false
    setState({ status: "loading", data: null, error: null })

    void runPromise(fetchDayEffect(slug))
      .then((data) => {
        dayCache.set(slug, data)
        if (!cancelled) startTransition(() => setState({ status: "success", data, error: null }))
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: "error", data: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [slug, startTransition])

  if (stateSlugRef.current !== slug) {
    return getInitialDayState(slug)
  }

  return state
}
