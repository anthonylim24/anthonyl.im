import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { ChevronDown, Plus } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
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
  EASE,
  EXIT_FADE,
  REVEAL_DURATION,
  alertErrorClass,
  checkboxClass,
  chipBtnClass,
  compactInputClass,
  dividerClass,
  hintClass,
  mutedInkClass,
  quietBtnClass,
  skeletonClass,
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

function placeLabel(place: PlaceResult): string {
  return place.name_romanized && place.name_romanized !== place.name
    ? `${place.name} (${place.name_romanized})`
    : place.name
}

function JobRowSkeleton() {
  return (
    <div className="space-y-2 py-2" aria-hidden>
      <div className={`h-3.5 w-2/3 ${skeletonClass}`} />
      <div className={`h-3 w-1/3 ${skeletonClass}`} />
    </div>
  )
}

export function TripIngest({
  trip,
  dayId,
  locked = false,
  onDaysChange,
}: {
  trip: Trip
  dayId: string
  locked?: boolean
  onDaysChange: (fn: (days: TripDay[]) => TripDay[]) => void
}) {
  const getToken = useGetToken()
  const urlId = useId()
  const skipId = useId()
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken
  const reduce = useReducedMotion()

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
    if (!canSubmit || locked) return
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
        setSubmitError("Instagram extraction is not available on this server.")
      } else {
        setSubmitError(err instanceof Error ? err.message : "Could not submit that URL.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleAdd = async (job: Job, place: PlaceResult) => {
    if (locked || !resolvedDay) return
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
      setAddError(err instanceof Error ? err.message : "Could not add that place.")
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
      <p className={`mt-2 text-xs leading-relaxed ${mutedInkClass}`}>
        Instagram extraction is not configured on this server.
      </p>
    )
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={quietBtnClass}
      >
        <IgIcon className="h-3.5 w-3.5" aria-hidden />
        Instagram
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={reduce ? EXIT_FADE : { duration: REVEAL_DURATION, ease: EASE }}
            className="mt-2"
          >
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor={urlId} className="sr-only">
              Instagram URL
            </label>
            <input
              id={urlId}
              type="url"
              inputMode="url"
              autoComplete="url"
              value={url}
              placeholder="Paste a post or Reel URL"
              disabled={locked}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={url.length > 0 && !isInstagramUrl(url) ? true : undefined}
              className={`min-w-0 flex-1 text-[16px] sm:text-sm ${compactInputClass}`}
            />
            <button
              type="submit"
              disabled={!canSubmit || locked}
              aria-label={submitting ? "Submitting" : "Extract places"}
              className={`${chipBtnClass} w-full sm:w-auto`}
            >
              {submitting ? null : <IgIcon className="h-3.5 w-3.5" aria-hidden />}
              {submitting ? "Submitting" : "Extract"}
            </button>
          </form>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <label htmlFor={skipId} className={`inline-flex min-h-11 items-center gap-2 text-xs ${mutedInkClass}`}>
              <input
                id={skipId}
                type="checkbox"
                checked={skipVideo}
                disabled={locked}
                onChange={(e) => setSkipVideo(e.target.checked)}
                className={checkboxClass}
              />
              Caption only
            </label>
            {url && !isInstagramUrl(url) && (
              <p className={`text-xs ${mutedInkClass}`}>Use an instagram.com URL.</p>
            )}
          </div>

          {submitError && (
            <div className={`mt-2 ${alertErrorClass}`} role="alert">
              <p>{submitError}</p>
              <button
                type="button"
                disabled={locked || submitting}
                onClick={() => void handleSubmit({ preventDefault() {} } as React.FormEvent)}
                className={`${quietBtnClass} mt-2`}
              >
                Try again
              </button>
            </div>
          )}
          {addError && (
            <div className={`mt-2 ${alertErrorClass}`} role="alert">
              <p>{addError}</p>
            </div>
          )}

          {visibleJobs.length === 0 ? (
            <div className="mt-3">
              <p className="text-sm">No posts extracted yet</p>
              <p className={hintClass}>Paste an Instagram URL to pull places onto this day.</p>
            </div>
          ) : (
            <ul className={`mt-2 ${dividerClass}`} aria-live="polite">
              {visibleJobs.map((job) => {
                const live = job.status === "pending" || job.status === "running"
                const failed = job.status === "failed" || job.status === "dead"
                return (
                  <li key={job.id} className="py-2">
                    <div className="flex items-center gap-2">
                      <p className={`min-w-0 flex-1 truncate text-xs font-medium ${wrapAnywhereClass}`}>
                        {shortIgPath(job.url)}
                        <span className={`ml-1.5 font-normal ${mutedInkClass}`}>{jobStatusLabel(job)}</span>
                      </p>
                    </div>

                    {live ? <JobRowSkeleton /> : null}

                    {failed ? (
                      <div className={`mt-2 ${alertErrorClass}`} role="alert">
                        <p>{job.last_error?.trim() || "This extraction failed."}</p>
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => void handleRetry(job)}
                          className={`${quietBtnClass} mt-2`}
                        >
                          Retry
                        </button>
                      </div>
                    ) : null}

                    {job.status === "done" && job.places.length === 0 && (
                      <p className={`mt-1 text-xs ${mutedInkClass}`}>No places found.</p>
                    )}

                    {job.places.length > 0 && (
                      <ul className="mt-1">
                        {job.places.map((place) => {
                          const key = placeKey(job.id, place.id)
                          const already = resolvedDay ? dayHasPlaceNamed(resolvedDay, place.name) : false
                          const added = Boolean(addedKeys[key]) || already
                          const busy = addingKey === key
                          const category = place.category?.trim()
                          const address = place.address?.trim()
                          const meta =
                            category && address ? `${category} · ${address}` : category || address || ""
                          return (
                            <li key={place.id} className="flex items-center gap-2 py-1">
                              <div className="min-w-0 flex-1">
                                <p className={`truncate text-sm ${wrapAnywhereClass}`}>
                                  {placeLabel(place)}
                                </p>
                                {meta ? (
                                  <p className={`truncate font-mono-trips text-[11px] ${mutedInkClass}`}>{meta}</p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                disabled={added || busy || !resolvedDay || locked}
                                onClick={() => void handleAdd(job, place)}
                                aria-label={added ? `${place.name} is on this day` : `Add ${place.name} to this day`}
                                className={added ? quietBtnClass : chipBtnClass}
                              >
                                {busy || added ? null : (
                                  <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                                )}
                                {added ? "Added" : busy ? "Adding" : "Add"}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
