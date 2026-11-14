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
/** Longest a card may say "Watching the video" on our word alone, whatever the server says. */
export const DEEPEN_LIMIT_MS = 45_000

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
  /** Submits in flight, one batch of links each. Pastes can overlap. */
  const [batches, setBatches] = useState<ReadonlyArray<{ id: number; urls: string[] }>>([])
  const batchSeq = useRef(0)
  const submitting = batches.length > 0
  /** Links sent but not yet answered by the server: shown at once as cards. */
  const pendingUrls = useMemo(() => [...new Set(batches.flatMap((batch) => batch.urls))], [batches])
  const [problem, setProblem] = useState<string | null>(null)
  /**
   * Jobs being re-read with video. An id is held only until the server can
   * speak for the job: it shows the job running, or any refresh that began
   * after the re-read was accepted comes back (finished, failed, or off the
   * list). `DEEPEN_LIMIT_MS` is the backstop when no refresh gets through.
   */
  const [deepening, setDeepening] = useState<ReadonlySet<number>>(() => new Set())
  const deepened = useRef(new Set<number>())
  /** Re-reads the server has accepted: the next refresh to start settles them. */
  const accepted = useRef(new Set<number>())
  const limits = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const seq = useRef(0)

  const settle = useCallback((ids: readonly number[]) => {
    if (ids.length === 0) return
    for (const id of ids) {
      accepted.current.delete(id)
      clearTimeout(limits.current.get(id))
      limits.current.delete(id)
    }
    setDeepening((current) => {
      const still = new Set([...current].filter((id) => !ids.includes(id)))
      return still.size === current.size ? current : still
    })
  }, [])

  useEffect(() => {
    const timers = limits.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    const answered = [...accepted.current]
    try {
      const next = await listJobs(getToken)
      if (mine !== seq.current) return
      setJobs(next)
      setStatus("ready")
      const running = [...limits.current.keys()].filter((id) => next.some((job) => job.id === id && isLive(job)))
      settle([...answered, ...running])
    } catch (err) {
      if (mine !== seq.current) return
      if (err instanceof IgNotConfiguredError) setStatus("unconfigured")
      else setStatus((current) => (current === "loading" ? "ready" : current))
    }
  }, [getToken, settle])

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
      clearTimeout(limits.current.get(job.id))
      limits.current.set(
        job.id,
        setTimeout(() => settle([job.id]), DEEPEN_LIMIT_MS),
      )
      setSessionIds((ids) => (ids.includes(job.id) ? ids : [job.id, ...ids]))
      try {
        // Re-submitting flips the job to "watch the video"; re-extract runs it.
        await submitPosts(getToken, [job.url], false)
        await reextractJob(getToken, job.id)
        if (limits.current.has(job.id)) accepted.current.add(job.id)
        await refresh()
      } catch (err) {
        settle([job.id])
        setProblem(`Couldn’t read that post again. (${errorMessage(err)})`)
      }
    },
    [getToken, refresh, settle],
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
      const batch = { id: ++batchSeq.current, urls: urls.slice(0, 20) }
      setBatches((current) => [...current, batch])
      setProblem(null)
      try {
        const result = await submitPosts(getToken, batch.urls, true)
        const ids = result.jobs.map((job) => job.jobId)
        setSessionIds((current) => [...ids.filter((id) => !current.includes(id)).reverse(), ...current])
        await refresh()
      } catch (err) {
        if (err instanceof IgNotConfiguredError) setStatus("unconfigured")
        else setProblem(`That link didn’t go through. (${errorMessage(err)})`)
      } finally {
        setBatches((current) => current.filter((other) => other.id !== batch.id))
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
