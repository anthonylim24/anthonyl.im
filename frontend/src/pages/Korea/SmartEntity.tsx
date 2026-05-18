// <SmartEntity> — inline button that opens a dossier-style popover.
//
// Wraps a piece of important information (flight number, hotel name,
// city, restaurant) and gives the reader two things:
//
//   1. A concise dossier-voice description, generated server-side by
//      /api/entity/about (Groq llama-3.1-8b-instant, JSON mode, with
//      L1 in-memory + L2 Supabase cache so a unique entity only hits
//      the LLM once per project). Loaded lazily on open.
//   2. A curated list of external destinations (Google Maps, Wikipedia,
//      Naver Place, brand sites, FlightAware, etc.) built per type.
//
// Rendering: the popover is portalled to document.body and uses
// position: fixed so it escapes parent overflow / transform / stacking
// contexts (e.g. the modal Map Mode overlay, the drag-sheet, scroll
// containers). Before this, the popover was caught by ancestor
// overflow:hidden and got clipped.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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

// Frontend module-level cache. The trip's entity corpus is small (~50);
// every result we ever fetch in this session stays here so re-opening a
// popover (or rendering the same entity in multiple places) is free.
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

// Visual constants
const POPOVER_WIDTH = 320
const POPOVER_HEIGHT_ESTIMATE = 220
const POPOVER_MARGIN = 10

interface PopoverPosition {
  top: number
  left: number
  placement: "below" | "above"
  // Where the caret (small triangle pointing back at the trigger) lives,
  // expressed as an x offset within the popover. Lets the caret follow
  // the trigger even when the popover is clamped to the viewport edge.
  caretLeft: number
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

  // Lazy-fetch description on first open. Hydrate immediately on cache hit.
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

  // Position the popover. position:fixed in the portal, so coordinates
  // are viewport-relative (no scrollX/scrollY offsets). The caret tracks
  // the trigger's center even when the popover is clamped against the
  // viewport edges.
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const recomputePosition = useCallback(() => {
    const trig = triggerRef.current
    if (!trig) return
    const rect = trig.getBoundingClientRect()
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth

    // Flip up when not enough room below. Use the actual measured popover
    // height once we have one; otherwise estimate.
    const popoverHeight = popoverRef.current?.offsetHeight ?? POPOVER_HEIGHT_ESTIMATE
    const spaceBelow = viewportH - rect.bottom
    const spaceAbove = rect.top
    const placement: "below" | "above" =
      spaceBelow >= popoverHeight + POPOVER_MARGIN || spaceBelow >= spaceAbove ? "below" : "above"

    const top =
      placement === "below"
        ? rect.bottom + POPOVER_MARGIN
        : Math.max(POPOVER_MARGIN, rect.top - popoverHeight - POPOVER_MARGIN)

    const triggerCenter = rect.left + rect.width / 2
    let left = triggerCenter - POPOVER_WIDTH / 2
    left = Math.max(POPOVER_MARGIN, Math.min(viewportW - POPOVER_WIDTH - POPOVER_MARGIN, left))

    // Caret X within the popover. Clamp so it never overruns the popover's
    // own padding (8px on each side).
    let caretLeft = triggerCenter - left
    caretLeft = Math.max(16, Math.min(POPOVER_WIDTH - 16, caretLeft))

    setPosition({ top, left, placement, caretLeft })
  }, [])
  useLayoutEffect(() => {
    if (!open) return
    recomputePosition()
    // Recompute on any layout shift while open. Use `true` for capture so
    // we hear about scrolls inside inner containers (the Map Mode overlay
    // scrolls, for instance).
    const onMove = () => recomputePosition()
    window.addEventListener("resize", onMove)
    window.addEventListener("scroll", onMove, true)
    return () => {
      window.removeEventListener("resize", onMove)
      window.removeEventListener("scroll", onMove, true)
    }
  }, [open, recomputePosition])

  // Once the popover renders we can re-measure its actual height (the
  // first pass uses an estimate). Second pass corrects placement when
  // the content is shorter or taller than expected.
  useEffect(() => {
    if (!open || !position) return
    const id = requestAnimationFrame(() => recomputePosition())
    return () => cancelAnimationFrame(id)
  }, [open, description, recomputePosition, position])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
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

      {/* Portal to body so the popover escapes every ancestor's overflow,
          transform, and z-index stacking context. Without this the
          popover was being clipped under the next ancestor with
          `overflow: hidden` (e.g. the Map Mode modal, the day header). */}
      {typeof document !== "undefined" &&
        createPortal(
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
                  position: "fixed",
                  top: position.top,
                  left: position.left,
                  width: POPOVER_WIDTH,
                  zIndex: 9999,
                }}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-2xl shadow-stone-900/15 ring-1 ring-stone-200 dark:border-stone-800 dark:bg-stone-950 dark:shadow-black/40 dark:ring-stone-800"
              >
                {/* Caret pointing back at the trigger */}
                <span
                  aria-hidden
                  className={
                    "absolute h-3 w-3 rotate-45 border bg-stone-50 dark:bg-stone-950 " +
                    (position.placement === "below"
                      ? "-top-1.5 border-l border-t border-stone-200 dark:border-stone-800"
                      : "-bottom-1.5 border-b border-r border-stone-200 dark:border-stone-800")
                  }
                  style={{ left: position.caretLeft - 6 }}
                />

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
                          <span
                            aria-hidden
                            className="font-mono text-[9px] uppercase tracking-[0.18em] text-stone-400 dark:text-stone-600"
                          >
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
          </AnimatePresence>,
          document.body,
        )}
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
