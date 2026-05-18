// <SmartEntity> — inline button that opens a dossier-style popover.
//
// Wraps a piece of important information (flight number, hotel name,
// city, restaurant) and gives the reader two things:
//
//   1. A concise dossier-voice description, generated server-side by
//      /api/entity/about (Groq, JSON mode). Loaded lazily on open.
//   2. A curated list of external destinations (Google Maps, Wikipedia,
//      Naver Place, brand sites, FlightAware, etc.) built per type.
//
// Visually quiet by default — the entity name reads as normal text with
// a thin rose underline + small chevron mark. Click opens the popover
// anchored to the trigger. Esc and click-outside close it.

import { useEffect, useRef, useState, useId, useLayoutEffect, useCallback } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { ExternalLink, Loader2 } from "lucide-react"
import { resolveLinks, type EntityLink, type EntityType } from "./entityLinks"

interface SmartEntityProps {
  name: string
  type: EntityType
  city?: string
  /** Optional override for the visible label (defaults to `name`). */
  label?: string
  /** Optional inline children — wraps them instead of rendering `name`. */
  children?: React.ReactNode
  /** Pass-through className applied to the trigger button. */
  className?: string
  /** Compact variant: drops the chevron mark for use inside small chips. */
  compact?: boolean
}

interface AboutCacheEntry {
  description: string | null
  fetchedAt: number
}

// Module-level cache. The trip's entity corpus is ~50 items; we keep
// every result we ever fetch in this session so re-opening a popover
// (or rendering the same entity in multiple places) is free.
const aboutCache = new Map<string, AboutCacheEntry>()
const inflight = new Map<string, Promise<string | null>>()

function aboutKey(name: string, type: EntityType, city?: string): string {
  return `${type}|${name.toLowerCase().trim()}|${(city ?? "").toLowerCase().trim()}`
}

async function fetchAbout(name: string, type: EntityType, city?: string): Promise<string | null> {
  const key = aboutKey(name, type, city)
  const cached = aboutCache.get(key)
  if (cached) return cached.description
  const pending = inflight.get(key)
  if (pending) return pending

  const promise = (async () => {
    try {
      const r = await fetch("/api/entity/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, city }),
      })
      if (!r.ok) return null
      const j = (await r.json()) as { description?: string | null }
      return j.description ?? null
    } catch {
      return null
    }
  })()
    .then((description) => {
      aboutCache.set(key, { description, fetchedAt: Date.now() })
      return description
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

export function SmartEntity({
  name,
  type,
  city,
  label,
  children,
  className,
  compact = false,
}: SmartEntityProps) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState<string | null | "loading">("loading")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  const links: EntityLink[] = resolveLinks(name, type, { city })

  // Lazy-fetch the description when the popover first opens. If a result
  // is already cached, hydrate immediately to skip the loading state.
  useEffect(() => {
    if (!open) return
    const cached = aboutCache.get(aboutKey(name, type, city))
    if (cached) {
      setDescription(cached.description)
      return
    }
    setDescription("loading")
    let cancelled = false
    void fetchAbout(name, type, city).then((d) => {
      if (cancelled) return
      setDescription(d)
    })
    return () => {
      cancelled = true
    }
  }, [open, name, type, city])

  // Click-outside dismiss.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown, { passive: true })
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
    }
  }, [open])

  // Esc to close.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  // Position the popover. Uses the trigger's bounding box and flips up
  // when there's not enough room below. Recomputes on resize / scroll
  // while open.
  const [position, setPosition] = useState<{ top: number; left: number; placement: "below" | "above" } | null>(null)
  const recomputePosition = useCallback(() => {
    const trig = triggerRef.current
    if (!trig) return
    const rect = trig.getBoundingClientRect()
    const popoverWidth = 320
    const popoverHeightEstimate = 200
    const margin = 8
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth
    const spaceBelow = viewportH - rect.bottom
    const placement: "below" | "above" =
      spaceBelow >= popoverHeightEstimate || spaceBelow > rect.top ? "below" : "above"
    const top = placement === "below" ? rect.bottom + margin : Math.max(margin, rect.top - popoverHeightEstimate - margin)
    let left = rect.left + rect.width / 2 - popoverWidth / 2
    left = Math.max(margin, Math.min(viewportW - popoverWidth - margin, left))
    setPosition({ top: top + window.scrollY, left: left + window.scrollX, placement })
  }, [])
  useLayoutEffect(() => {
    if (!open) return
    recomputePosition()
    const onResize = () => recomputePosition()
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
    }
  }, [open, recomputePosition])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // Stop propagation so SmartEntity works inside a wrapping <a>
        // (e.g. the reservation row, which is itself a link to Maps).
        // The popover is the user's intent here, not the row's action.
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        className={
          "group/entity inline-flex items-baseline gap-0.5 break-words text-left underline decoration-rose-500/40 decoration-1 underline-offset-2 transition-colors hover:decoration-rose-500 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/50 dark:hover:text-rose-300 " +
          (className ?? "")
        }
      >
        <span className="min-w-0">{children ?? label ?? name}</span>
        {!compact && (
          <span
            aria-hidden
            className="ml-0.5 inline-block translate-y-[1px] text-[0.65em] text-stone-400 transition-colors group-hover/entity:text-rose-500 dark:text-stone-600"
          >
            ◇
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && position && (
          <motion.div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label={`Quick info about ${name}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: position.placement === "below" ? -4 : 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: position.placement === "below" ? -4 : 4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute",
              top: position.top,
              left: position.left,
              width: 320,
              zIndex: 60,
            }}
            className="origin-top rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-xl ring-1 ring-stone-200 dark:border-stone-800 dark:bg-stone-950 dark:ring-stone-800"
          >
            <header className="flex items-baseline justify-between gap-3 border-b border-stone-200/80 pb-2.5 dark:border-stone-800/80">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
                  {type}
                  {city ? (
                    <>
                      <span aria-hidden className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
                      {city}
                    </>
                  ) : null}
                </p>
                <p
                  className="mt-0.5 break-words font-serif text-lg font-medium leading-tight text-stone-900 dark:text-stone-100"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {name}
                </p>
              </div>
            </header>

            <div className="min-h-[44px] pb-1 pt-3">
              {description === "loading" ? (
                <p className="inline-flex items-center gap-2 text-[13px] italic leading-snug text-stone-500 dark:text-stone-500">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Looking it up…
                </p>
              ) : description ? (
                <p className="text-[13px] leading-relaxed text-stone-700 dark:text-stone-300">{description}</p>
              ) : (
                <p className="text-[13px] italic leading-relaxed text-stone-500 dark:text-stone-500">
                  No description yet. Try one of the links below.
                </p>
              )}
            </div>

            <ul className="mt-2 flex flex-col gap-px border-t border-stone-200/80 pt-2 dark:border-stone-800/80">
              {links.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] text-stone-700 transition-colors hover:bg-stone-100 hover:text-rose-700 focus-visible:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-rose-300"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className="font-mono text-[9px] uppercase tracking-[0.18em] text-stone-400 dark:text-stone-600">
                        {kindGlyph(l.kind)}
                      </span>
                      <span>{l.label}</span>
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function kindGlyph(kind: EntityLink["kind"]): string {
  switch (kind) {
    case "maps":
      return "MAP"
    case "wikipedia":
      return "WIKI"
    case "naver":
      return "NVR"
    case "official":
      return "OFC"
    case "tracker":
      return "TRK"
    case "reservation":
      return "RSV"
    case "search":
      return "SRC"
    case "knowledge":
      return "KB"
  }
}
