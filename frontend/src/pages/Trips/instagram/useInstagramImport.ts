import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { errorMessage } from "../../../effect/errors"
import { isLive, jobProgress } from "./instagram"
import {
  IgNotConfiguredError,
  listJobs,
  reextractJob,
  retryJob,
  submitPosts,
  type GetToken,
  type IgJob,
} from "./instagramApi"

const POLL_MS = 1600
const RECENT = 4

export type ImportStatus = "loading" | "ready" | "unconfigured"

/**
 * Jobs for the import sheet. Posts are read quickly first (caption and
 * comments); a post that names nothing there is read again with its video,
 * without the traveller asking. Polls only while something is in flight and
 * the tab is visible.
 */
export function useInstagramImport(getToken: GetToken, open: boolean) {
  const [jobs, setJobs] = useState<IgJob[]>([])
  const [status, setStatus] = useState<ImportStatus>("loading")
  const [sessionIds, setSessionIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  /** Links sent but not yet answered by the server: shown at once as cards. */
  const [pendingUrls, setPendingUrls] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  /** Jobs being re-read with video, until the server shows them running again. */
  const [deepening, setDeepening] = useState<ReadonlySet<number>>(() => new Set())
  const deepened = useRef(new Set<number>())
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    try {
      const next = await listJobs(getToken)
      if (mine !== seq.current) return
      setJobs(next)
      setStatus("ready")
      setDeepening((current) => {
        if (current.size === 0) return current
        const still = new Set([...current].filter((id) => !next.some((job) => job.id === id && isLive(job))))
        return still.size === current.size ? current : still
      })
    } catch (err) {
      if (mine !== seq.current) return
      if (err instanceof IgNotConfiguredError) setStatus("unconfigured")
      else setStatus((current) => (current === "loading" ? "ready" : current))
    }
  }, [getToken])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const session = useMemo(
    () => sessionIds.flatMap((id) => jobs.find((job) => job.id === id) ?? []),
    [jobs, sessionIds],
  )
  const recent = useMemo(
    () => jobs.filter((job) => !sessionIds.includes(job.id) && jobProgress(job).phase === "done").slice(0, RECENT),
    [jobs, sessionIds],
  )
  const live = session.some(isLive) || deepening.size > 0

  useEffect(() => {
    if (!open || !live) return
    const tick = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [open, live, refresh])

  /** Read a post again, this time with its video. */
  const deepen = useCallback(
    async (job: IgJob) => {
      deepened.current.add(job.id)
      setDeepening((current) => new Set(current).add(job.id))
      setSessionIds((ids) => (ids.includes(job.id) ? ids : [job.id, ...ids]))
      try {
        // Re-submitting flips the job to "watch the video"; re-extract runs it.
        await submitPosts(getToken, [job.url], false)
        await reextractJob(getToken, job.id)
        await refresh()
      } catch (err) {
        setDeepening((current) => {
          const next = new Set(current)
          next.delete(job.id)
          return next
        })
        setProblem(`Couldn’t read that post again. (${errorMessage(err)})`)
      }
    },
    [getToken, refresh],
  )

  // A quick read that finds nothing gets one deeper pass on its own.
  useEffect(() => {
    for (const job of session) {
      if (deepened.current.has(job.id)) continue
      if (jobProgress(job).phase === "empty" && job.skip_video !== false) void deepen(job)
    }
  }, [session, deepen])

  const submit = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return
      setSubmitting(true)
      setPendingUrls(urls.slice(0, 20))
      setProblem(null)
      try {
        const result = await submitPosts(getToken, urls.slice(0, 20), true)
        const ids = result.jobs.map((job) => job.jobId)
        setSessionIds((current) => [...ids.filter((id) => !current.includes(id)).reverse(), ...current])
        await refresh()
      } catch (err) {
        if (err instanceof IgNotConfiguredError) setStatus("unconfigured")
        else setProblem(`That link didn’t go through. (${errorMessage(err)})`)
      } finally {
        setPendingUrls([])
        setSubmitting(false)
      }
    },
    [getToken, refresh],
  )

  const retry = useCallback(
    async (job: IgJob) => {
      try {
        await retryJob(getToken, job.id)
        setSessionIds((ids) => (ids.includes(job.id) ? ids : [job.id, ...ids]))
        await refresh()
      } catch (err) {
        setProblem(`Couldn’t retry that post. (${errorMessage(err)})`)
      }
    },
    [getToken, refresh],
  )

  return { status, session, recent, submitting, pendingUrls, problem, setProblem, deepening, submit, retry, deepen }
}
