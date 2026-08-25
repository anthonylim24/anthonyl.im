import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { smartEntity } from './SmartEntity.stylex'
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

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { ExternalLink, Loader2 } from "lucide-react"
import { resolveLinks, type EntityLink, type EntityType } from "./entityLinks"
import { fetchAbout } from "./entityAboutApi"

interface SmartEntityProps {
  name: string
  type: EntityType
  city?: string
  /** Optional override for the visible label (defaults to `name`). */
  label?: string
  /** Optional inline children — wraps them instead of rendering `name`. */
  children?: React.ReactNode
  /** Pass-through style applied to the trigger button. */
  style?: StyleXStyles
  /** Compact variant: drops the chevron mark for use inside small chips. */
  compact?: boolean
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
  style,
  compact = false,
}: SmartEntityProps) {
  const reduce = useReducedMotion()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState<string | null | "loading">("loading")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  const links: EntityLink[] = resolveLinks(name, type, { city })

  // Lazy-fetch description on first open. Hydrate immediately on cache hit.
  useEffect(() => {
    if (!open) return
    setDescription("loading")
    let cancelled = false
    void fetchAbout(name, type, city).then((d) => {
      if (cancelled) return
      startTransition(() => setDescription(d))
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
    window.addEventListener("scroll", onMove, { capture: true, passive: true })
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
        {...sx(smartEntity.trigger, 'group/entity', style)}
      >
        <span {...sx(smartEntity.s3f58665f)}>{children ?? label ?? name}</span>
        {!compact && (
          <span
            aria-hidden
            {...sx(smartEntity.s9c7aa6f8)}
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
                {...sx(smartEntity.sffda4ad5)}
              >
                {/* Caret pointing back at the trigger */}
                <span
                  aria-hidden
                  {...sx(
                    smartEntity.caret,
                    position.placement === 'below' ? smartEntity.caretBelow : smartEntity.caretAbove,
                  )}
                  style={{ left: position.caretLeft - 6 }}
                />

                <header {...sx(smartEntity.s9bfe6255)}>
                  <div {...sx(smartEntity.s3f58665f)}>
                    <p {...sx(smartEntity.sa8fa1afe)}>
                      {type}
                      {city ? (
                        <>
                          <span aria-hidden {...sx(smartEntity.s34f26488)}>·</span>
                          {city}
                        </>
                      ) : null}
                    </p>
                    <p
                      {...sx(smartEntity.sbd43ef06)}
                      style={{ fontFamily: "'Cormorant Garamond', serif" }}
                    >
                      {name}
                    </p>
                  </div>
                </header>

                <div {...sx(smartEntity.s52cf604e)}>
                  {description === "loading" ? (
                    <p {...sx(smartEntity.sc7fe8e52)}>
                      <Loader2 {...sx(smartEntity.s30736863, 'animate-spin')} aria-hidden />
                      Looking it up…
                    </p>
                  ) : description ? (
                    <p {...sx(smartEntity.sce355e7e)}>{description}</p>
                  ) : (
                    <p {...sx(smartEntity.s8784fe5e)}>
                      No description yet. Try one of the links below.
                    </p>
                  )}
                </div>

                <ul {...sx(smartEntity.sf3a68b7c)}>
                  {links.map((l) => (
                    <li key={l.url}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        {...sx(smartEntity.sb40fab85)}
                      >
                        <span {...sx(smartEntity.s68bbb8b0)}>
                          <span
                            aria-hidden
                            {...sx(smartEntity.s55c044b)}
                          >
                            {kindGlyph(l.kind)}
                          </span>
                          <span>{l.label}</span>
                        </span>
                        <ExternalLink {...sx(smartEntity.se51249b)} aria-hidden />
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
