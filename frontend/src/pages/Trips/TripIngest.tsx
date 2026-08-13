import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { ChevronDown, Loader2, MapPin, Plus } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { IgIcon } from "../Korea/IgIcon"
import { isInstagramUrl } from "../Korea/isInstagramUrl"
import {
  ApiNotConfiguredError,
  listJobs,
  retryJob,
  submitUrl,
  type Job,
  type PlaceResult,
} from "../Korea/ingestApi"
import { addItem, dayHasPlaceNamed, itemFromExtractedPlace } from "./tripEdits"
import type { Trip, TripDay } from "./types"
import {
  alertErrorClass,
  checkboxClass,
  chipBtnClass,
  hintClass,
  inputClass,
  labelClass,
  mutedInkClass,
  primaryBtnClass,
  quietBtnClass,
  spinnerClass,
  wrapAnywhereClass,
} from "./ui"

const POLL_MS = 2000
const RECENT_DONE = 3

function shortIgPath(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "")
    return path || url
  } catch {
    return url
  }
}

function jobStatusLabel(job: Job): string {
  if (job.status === "done") {
    const n = job.places.length
    return n === 1 ? "1 place" : `${n} places`
  }
  if (job.status === "failed" || job.status === "dead") return job.last_error?.trim() || "Failed"
  if (job.status === "pending") return "Queued"
  if (job.step === "fetching") return "Fetching post"
  if (job.step === "bundling") return "Reading video"
  if (job.step === "extracting") return "Finding places"
  if (job.step === "geocoding") return "Locating"
  if (job.step === "saving") return "Saving"
  return "Extracting"
}

function placeKey(jobId: number, placeId: number): string {
  return `${jobId}:${placeId}`
}

export function TripIngest({
  trip,
  dayId,
  onDaysChange,
}: {
  trip: Trip
  dayId: string
  onDaysChange: (fn: (days: TripDay[]) => TripDay[]) => void
}) {
  const getToken = useGetToken()
  const urlId = useId()
  const skipId = useId()
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [skipVideo, setSkipVideo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [sessionIds, setSessionIds] = useState<number[]>([])
  const [addingKey, setAddingKey] = useState<string | null>(null)
  const [addedKeys, setAddedKeys] = useState<Record<string, string>>({})
  const [addError, setAddError] = useState<string | null>(null)

  const resolvedDay = trip.days.find((d) => d.id === dayId)

  const refreshJobs = useCallback(async () => {
    try {
      const next = await listJobs(getTokenRef.current, 30)
      setJobs(next)
      setUnavailable(false)
    } catch (err) {
      if (err instanceof ApiNotConfiguredError) setUnavailable(true)
    }
  }, [])

  useEffect(() => {
    void refreshJobs()
  }, [refreshJobs])

  const sessionSet = useMemo(() => new Set(sessionIds), [sessionIds])
  const visibleJobs = useMemo(() => {
    const session = jobs.filter((j) => sessionSet.has(j.id))
    const extras = jobs
      .filter((j) => !sessionSet.has(j.id) && j.status === "done" && j.places.length > 0)
      .slice(0, RECENT_DONE)
    const seen = new Set(session.map((j) => j.id))
    return [...session, ...extras.filter((j) => !seen.has(j.id))]
  }, [jobs, sessionSet])

  const hasLive = visibleJobs.some((j) => j.status === "pending" || j.status === "running")

  useEffect(() => {
    if (!hasLive) return
    const tick = () => {
      if (document.visibilityState !== "visible") return
      void refreshJobs()
    }
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [hasLive, refreshJobs])

  const canSubmit = isInstagramUrl(url) && !submitting && !unavailable

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await submitUrl(getTokenRef.current, url, { skipVideo })
      setUrl("")
      setSessionIds((prev) => {
        const next = [...prev]
        for (const j of result.jobs) {
          if (!next.includes(j.jobId)) next.push(j.jobId)
        }
        return next
      })
      await refreshJobs()
    } catch (err) {
      if (err instanceof ApiNotConfiguredError) {
        setUnavailable(true)
        setSubmitError("Instagram extraction isn’t available on this server.")
      } else {
        setSubmitError(err instanceof Error ? err.message : "Couldn’t submit that URL.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleAdd = async (job: Job, place: PlaceResult) => {
    if (!resolvedDay) return
    const key = placeKey(job.id, place.id)
    if (addingKey || addedKeys[key]) return
    if (dayHasPlaceNamed(resolvedDay, place.name)) {
      setAddedKeys((prev) => ({ ...prev, [key]: resolvedDay.id }))
      return
    }
    setAddingKey(key)
    setAddError(null)
    try {
      const item = itemFromExtractedPlace({
        name: place.name,
        nameRomanized: place.name_romanized,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        category: place.category,
        confidence: place.confidence_band,
        quote: place.supporting_quote,
        sourceUrl: job.url,
      })
      onDaysChange((days) => addItem(days, resolvedDay.id, item))
      setAddedKeys((prev) => ({ ...prev, [key]: resolvedDay.id }))
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn’t add that place.")
    } finally {
      setAddingKey(null)
    }
  }

  const handleRetry = async (job: Job) => {
    try {
      await retryJob(getTokenRef.current, job.id)
      setSessionIds((prev) => (prev.includes(job.id) ? prev : [...prev, job.id]))
      await refreshJobs()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Retry failed.")
    }
  }

  if (unavailable && visibleJobs.length === 0) {
    return (
      <p className={`mt-3 text-sm leading-relaxed ${mutedInkClass}`}>
        Instagram extraction isn’t configured on this server.
      </p>
    )
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={quietBtnClass}
      >
        <IgIcon className="h-3.5 w-3.5" aria-hidden />
        Instagram
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-stone-200/80 p-3 dark:border-stone-800">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div>
              <label htmlFor={urlId} className={labelClass}>
                Instagram URL
              </label>
              <input
                id={urlId}
                type="url"
                inputMode="url"
                autoComplete="url"
                value={url}
                placeholder="https://www.instagram.com/reel/…"
                onChange={(e) => setUrl(e.target.value)}
                aria-invalid={url.length > 0 && !isInstagramUrl(url) ? true : undefined}
                className={`mt-1.5 text-[16px] sm:text-sm ${inputClass}`}
              />
              <p className={hintClass}>
                {url && !isInstagramUrl(url)
                  ? "Use an instagram.com post or Reel URL."
                  : "Paste a post or Reel. Extracted places are added to this day."}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor={skipId} className="inline-flex min-h-11 items-center gap-2.5 text-sm text-stone-700 dark:text-stone-300">
                <input
                  id={skipId}
                  type="checkbox"
                  checked={skipVideo}
                  onChange={(e) => setSkipVideo(e.target.checked)}
                  className={checkboxClass}
                />
                Caption only, skip video
              </label>
              <button type="submit" disabled={!canSubmit} className={primaryBtnClass}>
                {submitting ? (
                  <Loader2 className={`h-4 w-4 ${spinnerClass}`} aria-hidden />
                ) : (
                  <IgIcon className="h-4 w-4" aria-hidden />
                )}
                {submitting ? "Submitting" : "Extract places"}
              </button>
            </div>
          </form>

          {submitError && (
            <div className={`mt-4 ${alertErrorClass}`} role="alert">
              {submitError}
            </div>
          )}
          {addError && (
            <div className={`mt-4 ${alertErrorClass}`} role="alert">
              {addError}
            </div>
          )}

          {visibleJobs.length > 0 && (
            <ul className="mt-4 divide-y divide-stone-200/80 dark:divide-stone-800/80" aria-live="polite">
              {visibleJobs.map((job) => (
                <li key={job.id} className="py-4 first:pt-0">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--ta-soft)] text-[color:var(--ta)]">
                      {job.status === "pending" || job.status === "running" ? (
                        <Loader2 className={`h-4 w-4 ${spinnerClass}`} aria-hidden />
                      ) : (
                        <IgIcon className="h-4 w-4" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
                        {shortIgPath(job.url)}
                      </p>
                      <p className={`mt-0.5 text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>{jobStatusLabel(job)}</p>
                    </div>
                    {(job.status === "failed" || job.status === "dead") && (
                      <button type="button" onClick={() => void handleRetry(job)} className={quietBtnClass}>
                        Retry
                      </button>
                    )}
                  </div>

                  {job.status === "done" && job.places.length === 0 && (
                    <p className={`mt-3 pl-12 text-sm ${mutedInkClass}`}>No places found in this post.</p>
                  )}

                  {job.places.length > 0 && (
                    <ul className="mt-3 space-y-2 pl-0 sm:pl-12">
                      {job.places.map((place) => {
                        const key = placeKey(job.id, place.id)
                        const already = resolvedDay ? dayHasPlaceNamed(resolvedDay, place.name) : false
                        const added = Boolean(addedKeys[key]) || already
                        const busy = addingKey === key
                        return (
                          <li
                            key={place.id}
                            className="flex flex-col gap-2 rounded-xl border border-stone-200/80 bg-[var(--trips-surface)] p-3 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800/80"
                          >
                            <div className="min-w-0">
                              <p className={`text-sm font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
                                {place.name}
                                {place.name_romanized && place.name_romanized !== place.name
                                  ? ` (${place.name_romanized})`
                                  : ""}
                              </p>
                              <p className={`mt-0.5 flex items-start gap-1.5 text-xs ${mutedInkClass}`}>
                                <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                                <span className={wrapAnywhereClass}>
                                  {[place.category, place.address].filter(Boolean).join(" · ") || "No address yet"}
                                </span>
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={added || busy || !resolvedDay}
                              onClick={() => void handleAdd(job, place)}
                              className={added ? quietBtnClass : chipBtnClass}
                            >
                              {busy ? (
                                <Loader2 className={`h-3.5 w-3.5 ${spinnerClass}`} aria-hidden />
                              ) : (
                                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                              )}
                              {added ? "On this day" : "Add to this day"}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
