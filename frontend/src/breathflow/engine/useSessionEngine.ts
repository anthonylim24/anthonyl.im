import { useCallback, useEffect, useRef, useState } from 'react'
import { useLatestCallback } from '@/hooks/useLatestCallback'
import type { EngineConfig } from './sessionEngine'
import {
  nextTickAt,
  reduceSession,
  SETUP,
  type Completion,
  type Saved,
  type Session,
  type SessionEffect,
  type SessionEvent,
} from './sessionMachine'

export type OutputEffect = Exclude<SessionEffect, { type: 'persist' }>

export interface SessionEffects {
  /** Sound, speech, haptics and announcements. */
  perform: (effect: OutputEffect) => void
  /** Write the finished session (history, XP, journey). Runs once per session. */
  persist: (completion: Completion) => Saved
}

export interface SessionEngineHandle {
  session: Session
  send: (event: SessionEvent) => void
}

/**
 * React driver for the pure session machine (`sessionMachine.ts`). The
 * session is React state, not a store: it lives as long as the page.
 *
 * - The clock is one timeout at a time, aimed at the true end of the
 *   current second (`originMs + n * 1000`) rather than a free-running
 *   interval, so drift never accumulates and a pause keeps its fraction.
 *   It is re-armed inside `send`, not in an effect, so the next second never
 *   waits on React committing the last one.
 * - `visibilitychange` becomes HIDDEN / VISIBLE, so a page left in the
 *   background pauses instead of breathing on unseen.
 */
export function useSessionEngine(
  config: EngineConfig,
  effects: SessionEffects,
  initial: Session = SETUP,
): SessionEngineHandle {
  const [session, setSession] = useState<Session>(initial)
  const sessionRef = useRef(session)
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  }, [config])
  const perform = useLatestCallback(effects.perform)
  const persist = useLatestCallback(effects.persist)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const send = useCallback((event: SessionEvent) => {
    dispatch(event)

    function dispatch(first: SessionEvent) {
      const queue: SessionEvent[] = [first]
      for (let event = queue.shift(); event; event = queue.shift()) {
        const previous = sessionRef.current
        const [next, output] = reduceSession(configRef.current, previous, event)
        if (next !== previous) {
          sessionRef.current = next
          setSession(next)
        }
        // A tick that found nothing due (an early timer) still re-arms the clock.
        if (next !== previous || event.type === 'TICK') arm(next)
        for (const effect of output) {
          if (effect.type === 'persist') queue.push({ type: 'SAVED', saved: persist(effect.completion) })
          else perform(effect)
        }
      }
    }

    function arm(next: Session) {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
      if (next.tag === 'running') {
        const wait = Math.max(0, nextTickAt(next) - performance.now())
        timer.current = setTimeout(() => dispatch({ type: 'TICK', now: performance.now() }), wait)
      } else if (next.tag === 'leadIn') {
        timer.current = setTimeout(() => dispatch({ type: 'LEAD_TICK', now: performance.now() }), 1000)
      }
    }
  }, [perform, persist])

  // An autostarted lead-in needs its first second armed; unmounting stops the clock.
  useEffect(() => {
    if (sessionRef.current.tag === 'leadIn') {
      timer.current = setTimeout(() => send({ type: 'LEAD_TICK', now: performance.now() }), 1000)
    }
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
    }
  }, [send])

  useEffect(() => {
    const onVisibility = () => {
      const now = performance.now()
      send(document.visibilityState === 'hidden' ? { type: 'HIDDEN', now } : { type: 'VISIBLE', now })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [send])

  return { session, send }
}
