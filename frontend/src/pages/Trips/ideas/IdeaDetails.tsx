import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Globe, Link2, MapPin, Map as MapIcon, Phone, Star, X } from "lucide-react"
import { stylex, sx } from "@/styles/merge"
import { useLatestCallback } from "../../../hooks/useLatestCallback"
import { useReducedMotion } from "../../../hooks/useReducedMotion"
import { externalMapsLink } from "../../../lib/externalMaps"
import { a } from "../atlas.stylex"
import { DialogFrame } from "../components/kit"
import { ExitSignal, useClosing, useLeaving } from "../components/presence"
import type { ItineraryItem } from "../types"
import { IDEA_ANCHOR_ATTR, ideaName, type IdeaDetailsProps, type PlaceDetails, type PlacePhoto } from "./contract"
import { d } from "./details.stylex"
import { focusedHeartSpot, ideaFocusReturn } from "./focusReturn"
import { placeBeside } from "./popoverPlacement"
import {
  cachedPlaceDetails,
  detailsTarget,
  loadPlaceDetails,
  PlaceDetailsError,
  webUrl,
  type DetailsTarget,
} from "./placeDetailsApi"

// The details popover for one wishlist idea: its photos, what kind of place
// it is, rating and price, a summary, address, hours and links, then the
// traveller's own notes, and Add to day / Remove for editors. Beside the row
// on wide screens (non-modal: the list and map stay usable); a sheet on
// phones and when opened from the map. Everything about the place is fetched
// on open and never written to the trip.

/** Wide enough for a card beside the list; narrower, the popover is a bottom sheet. */
const WIDE_QUERY = "(min-width: 640px)"

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window === "undefined" || !window.matchMedia || window.matchMedia(WIDE_QUERY).matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia(WIDE_QUERY)
    const sync = () => setWide(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])
  return wide
}

export type DetailsLoad =
  | { status: "loading" }
  | { status: "ready"; details: PlaceDetails | null }
  | { status: "error"; message: string }

const FAILED = "Couldn’t load this place’s details."

/** The details for `target`, from this session's cache when it has them; `retry` asks again after a failure. */
function usePlaceDetails(target: DetailsTarget | null, getToken: IdeaDetailsProps["getToken"]) {
  const [attempt, setAttempt] = useState(0)
  const requestKey = target ? `${target.key}#${attempt}` : ""
  const [answer, setAnswer] = useState<{ key: string; load: DetailsLoad } | null>(null)
  const known = target ? cachedPlaceDetails(target) : null
  const cached = known !== undefined

  useEffect(() => {
    if (!target || cached) return
    // The answer belongs to this request: closing the popover or opening
    // another idea aborts it, and a late answer is dropped.
    const controller = new AbortController()
    loadPlaceDetails(getToken, target, controller.signal).then(
      (details) => {
        if (!controller.signal.aborted) setAnswer({ key: requestKey, load: { status: "ready", details } })
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setAnswer({ key: requestKey, load: { status: "error", message: err instanceof PlaceDetailsError ? err.message : FAILED } })
      },
    )
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `requestKey` names the place and the attempt; `target` is rebuilt on every edit to the idea, and `cached` turning false (an answer lapsing while open) asks again
  }, [requestKey, getToken, cached])

  const asked: DetailsLoad =
    known !== undefined ? { status: "ready", details: known } : answer?.key === requestKey ? answer.load : { status: "loading" }
  // While an answer that lapsed is asked for again, the card keeps showing it
  // (no skeleton, the carousel stays where it was), and keeps it if asking
  // again fails: an older answer beats an error.
  const [shown, setShown] = useState<{ key: string; details: PlaceDetails | null } | null>(null)
  const placeKey = target?.key ?? ""
  if (asked.status === "ready" && (shown?.key !== placeKey || shown.details !== asked.details)) {
    setShown({ key: placeKey, details: asked.details })
  }
  const load: DetailsLoad = asked.status !== "ready" && shown?.key === placeKey ? { status: "ready", details: shown.details } : asked
  return { load, retry: () => setAttempt((n) => n + 1) }
}

export function IdeaDetails({ trip, idea, from, editable, locked, getToken, themeControl, onAddToDay, onRemove, onClose }: IdeaDetailsProps) {
  const wide = useWide()
  const target = useMemo(() => detailsTarget(idea), [idea])
  const { load, retry } = usePlaceDetails(target, getToken)
  const titleId = useId()
  const accent = trip.appearance?.accent
  const name = ideaName(idea)
  /**
   * The row to stand beside, or null for a sheet; undefined until decided.
   * Decided once, as they open, from who opened them: re-grouping the list,
   * a new category or a scroll never moves or turns an open card.
   */
  const [anchor, setAnchor] = useState<HTMLElement | null | undefined>(undefined)
  const [opener] = useState(from)
  /** Where the heart that opened it was, while it still has focus (render runs before the dialog takes it). */
  const [heartSpot] = useState(focusedHeartSpot)
  useLayoutEffect(() => {
    // Before the first paint, so the card never shows as one thing and then the other.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measured once from the DOM, which render may not read
    setAnchor(opener === "row" ? rowInView(idea.id) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening: the details are keyed by idea, and the decision must not follow later renders
  }, [])

  const content = (title: ReactNode) => (
    <DetailsContent
      idea={idea}
      target={target}
      load={load}
      title={title}
      themeControl={themeControl}
      editable={editable}
      locked={locked}
      onAddToDay={onAddToDay}
      onRemove={onRemove}
      onClose={onClose}
      onRetry={retry}
    />
  )
  // In the sheet, Radix's Title gives the heading its id and labels the dialog
  // with it; an `id` prop here, even undefined, would override that one.
  const heading = (id?: string) => (
    <h2 {...(id ? { id } : {})} {...sx(d.title)}>
      {name}
    </h2>
  )

  if (anchor === undefined) return null
  if (anchor && wide) {
    return (
      <Popover anchor={anchor} anchorId={idea.id} accent={accent} labelledBy={titleId} onClose={onClose}>
        {content(heading(titleId))}
      </Popover>
    )
  }
  return (
    <DialogFrame open onClose={onClose} accent={accent} returnFocus={() => ideaFocusReturn(idea.id, { near: heartSpot })} content={[a.dialog, d.sheet, "trips-glass-sheet"]}>
      <DialogPrimitive.Description {...sx(a.srOnly)}>Details, photos and links for {name}</DialogPrimitive.Description>
      {content(<DialogPrimitive.Title asChild>{heading()}</DialogPrimitive.Title>)}
    </DialogFrame>
  )
}

/** The list row named `ideaId`, when it is on the page. The id is compared, never put into a selector. */
function findRow(ideaId: string): HTMLElement | null {
  for (const node of document.querySelectorAll<HTMLElement>(`[${IDEA_ANCHOR_ATTR}]`)) {
    if (node.getAttribute(IDEA_ANCHOR_ATTR) === ideaId) return node
  }
  return null
}

/**
 * The row to anchor on as the details open: its name, when it is on the page
 * and in view. A row in a hidden pane (the phone's map view) or scrolled away
 * is no anchor: the details open as a sheet.
 */
function rowInView(ideaId: string): HTMLElement | null {
  const node = findRow(ideaId)
  if (!node) return null
  const box = node.getBoundingClientRect()
  return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight ? node : null
}

/** The row the popover stands beside, found again when the list re-rendered it (a new category under Type grouping). */
function liveRow(row: RefObject<HTMLElement>, ideaId: string): HTMLElement | null {
  if (row.current.isConnected) return row.current
  const found = findRow(ideaId)
  if (found) row.current = found
  return found
}

/**
 * Focus back on the row, flagged as the card's own move. Effects do this as
 * the card goes (and React's StrictMode runs them twice as it opens): that is
 * not "focus moved elsewhere". Escape and Tab, which mean "done", also close.
 */
function handFocusBack(row: RefObject<HTMLElement>, ideaId: string, handing: RefObject<boolean>) {
  handing.current = true
  try {
    liveRow(row, ideaId)?.focus({ preventScroll: true })
  } finally {
    handing.current = false
  }
}

/** Over the sticky header and the map, like a kit menu. */
const FLOATING = { position: "fixed", right: "auto", bottom: "auto" } as const

/** What Tab can reach inside the card. The carousel's hidden credit links are -1, so out. */
const FOCUSABLE = ["a[href]", "button:not(:disabled)", "select:not(:disabled)", "input:not(:disabled)", "textarea:not(:disabled)", "summary", "[tabindex]"]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(", ")

/**
 * A non-modal dialog floating beside a list row: the list and the map stay
 * usable. Focus moves in as it opens; Tab past either end, Escape, focus
 * moving elsewhere or a press outside close it and hand focus back to the
 * row (a press on the row, or in another Trips portal, does not). It leaves
 * the way menus do (`trips-pop`), inert from the moment it starts to.
 */
function Popover({
  anchor,
  anchorId,
  accent,
  labelledBy,
  onClose,
  children,
}: {
  anchor: HTMLElement
  anchorId: string
  accent?: string
  labelledBy: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const row = useRef(anchor)
  const closing = useClosing()
  const leave = useLeaving(!closing, ref)
  const close = useLatestCallback(onClose)
  /** A press outside is under way: its click decides, not the focus it moves. */
  const pressing = useRef(false)
  /** The card itself is handing focus back to the row: not a reason to close. */
  const handing = useRef(false)
  const handBack = useLatestCallback(() => handFocusBack(row, anchorId, handing))

  // Placed before it paints, and again when the page scrolls or resizes, or
  // the card's own height changes as its details arrive. Written to the node:
  // nothing in React depends on it. With its row gone from the page (or not
  // laid out), the card stays where it last was rather than jump to a corner.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const place = () => {
      const box = liveRow(row, anchorId)?.getBoundingClientRect()
      if (!box || (box.width === 0 && box.height === 0)) return
      // Measured unclamped: held to a max height the card reports the clamp,
      // which would lift the clamp, then set it again, every frame.
      node.style.maxHeight = ""
      const at = placeBeside({
        anchor: box,
        size: { width: node.offsetWidth, height: node.scrollHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      })
      node.style.top = `${at.top}px`
      node.style.left = `${at.left}px`
      node.style.maxHeight = at.maxHeight === null ? "" : `${at.maxHeight}px`
      node.style.transformOrigin = at.transformOrigin
    }
    place()
    window.addEventListener("scroll", place, { capture: true, passive: true })
    window.addEventListener("resize", place)
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place)
    resize?.observe(node)
    return () => {
      window.removeEventListener("scroll", place, { capture: true })
      window.removeEventListener("resize", place)
      resize?.disconnect()
    }
  }, [anchorId])

  // Focus in as it opens (or opens again while still on its way out), and
  // never on a later render; back to the row if it leaves with focus in it.
  useEffect(() => {
    if (closing) return
    const node = ref.current
    node?.focus({ preventScroll: true })
    return () => {
      const active = document.activeElement
      if (!active || active === document.body || node?.contains(active)) handBack()
    }
  }, [closing, handBack])

  // Closing makes the card inert, which would drop focus to <body>: hand it to the row first.
  useLayoutEffect(() => {
    if (!closing) return
    const active = document.activeElement
    if (active && ref.current?.contains(active)) handBack()
  }, [closing, handBack])

  // A press outside closes it once its click has landed, and only if that
  // click left this card open: a press on another idea, a pin or Add to day
  // opens that instead, and this card is then already on its way out.
  useEffect(() => {
    if (closing) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      pressing.current = Boolean(
        target && !ref.current?.contains(target) && !liveRow(row, anchorId)?.contains(target) && !target.closest?.(".trips-portal"),
      )
    }
    const onUp = () => {
      if (!pressing.current) return
      pressing.current = false
      timer = setTimeout(close, 0)
    }
    const onCancel = () => {
      pressing.current = false
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("pointerup", onUp)
    document.addEventListener("pointercancel", onCancel)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("pointerup", onUp)
      document.removeEventListener("pointercancel", onCancel)
      clearTimeout(timer)
      pressing.current = false
    }
  }, [closing, anchorId, close])

  /** Leave for the row: Escape, or Tab past either end of the card. */
  const leaveToRow = () => {
    handBack()
    close()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      leaveToRow()
      return
    }
    if (event.key !== "Tab") return
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((node) => !node.closest("[inert]"))
    const active = document.activeElement
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (event.shiftKey && (!first || active === first || active === ref.current)) {
      // Back to the row itself, as if the card sat right after it in the page.
      event.preventDefault()
      leaveToRow()
    } else if (!event.shiftKey && (!last || active === last)) {
      // Focus goes to the row and the Tab carries on from there, to what follows it.
      leaveToRow()
    }
  }

  // Focus moved somewhere else on the page (not by a press, which its click
  // settles; not into another Trips portal such as a toast; not to its own
  // row, which a press on it focuses in Chrome and leaves this open): it is done.
  const onBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Element | null
    if (!next || pressing.current || handing.current || ref.current?.contains(next) || next.closest?.(".trips-portal")) return
    if (liveRow(row, anchorId)?.contains(next)) return
    close()
  }

  return createPortal(
    <div className="trips trips-portal" data-trip-accent={accent}>
      {leave.present ? (
        <div
          ref={ref}
          role="dialog"
          aria-modal="false"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          style={FLOATING}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          // `trips-pop`: the closing animation in index.css (cut short under reduced motion).
          {...sx(d.popover, "trips-glass-sheet", "trips-pop")}
          {...leave.bind}
        >
          <ExitSignal />
          {children}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

const PRICE = ["Free", "Inexpensive", "Moderate", "Expensive", "Very expensive"] as const
const count = new Intl.NumberFormat("en")

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** "Monday: 9:00 AM – 6:00 PM" → ["Monday", "9:00 AM – 6:00 PM"]. */
function splitDay(line: string): [string, string] {
  const at = line.indexOf(": ")
  return at > 0 ? [line.slice(0, at), line.slice(at + 2)] : ["", line]
}

function DetailsContent({
  idea,
  target,
  load,
  title,
  themeControl,
  editable,
  locked,
  onAddToDay,
  onRemove,
  onClose,
  onRetry,
}: {
  idea: ItineraryItem
  target: DetailsTarget | null
  load: DetailsLoad
  title: ReactNode
  themeControl?: ReactNode
  editable: boolean
  locked: boolean
  onAddToDay: () => void
  onRemove: () => void
  onClose: () => void
  onRetry: () => void
}) {
  const details = load.status === "ready" ? load.details : null
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  const photos = (details?.photos ?? []).filter((photo) => !broken.has(photo.url))
  // Hold the photo's place only while one is likely to come.
  const photoBox = photos.length > 0 || (load.status === "loading" && target !== null)

  const closeButton = (overPhoto: boolean) => (
    <button type="button" onClick={onClose} aria-label="Close" {...sx(overPhoto ? [d.overlayBtn, d.close] : [a.iconBtn, a.iconBtnSm])}>
      <X size={18} strokeWidth={1.75} aria-hidden />
    </button>
  )

  const location = idea.location
  const address = details?.address ?? location?.address
  // Only for a place: a note's sentence is not something to search a map for.
  const maps =
    location || details
      ? externalMapsLink({ name: location?.name || ideaName(idea), address, lat: location?.lat, lng: location?.lng, mapsUrl: details?.mapsUrl })
      : undefined
  const notes = idea.notes?.trim()
  const links = [...new Set((idea.links ?? []).map((link) => webUrl(link)).filter((link): link is string => Boolean(link)))]

  return (
    <>
      <div {...sx(d.scroll)} aria-busy={load.status === "loading"}>
        {photos.length > 0 ? (
          <Carousel
            key={photos.map((photo) => photo.url).join(" ")}
            name={ideaName(idea)}
            photos={photos}
            close={closeButton(true)}
            onBroken={(url) => setBroken((was) => new Set(was).add(url))}
          />
        ) : photoBox ? (
          <div {...sx(d.photos)}>
            <div {...sx(a.skeleton, d.photoSkeleton)} aria-hidden />
            {closeButton(true)}
          </div>
        ) : null}

        <div {...sx(d.body, !photoBox && d.bodyBare)}>
          <div {...sx(d.head)}>
            <div {...sx(d.headText)}>
              {details?.typeLabel ? <p {...sx(a.eyebrow)}>{details.typeLabel}</p> : null}
              {title}
              <Meta details={details} />
              {/* Its own line: beside the title it squeezed a long name into a column of letters. */}
              {themeControl ? <div {...sx(d.themeSlot)}>{themeControl}</div> : null}
            </div>
            {!photoBox ? closeButton(false) : null}
          </div>

          {load.status === "loading" ? (
            <div {...sx(d.lines)} aria-hidden>
              <span {...sx(a.skeleton, d.line, d.lineShort)} />
              <span {...sx(a.skeleton, d.line)} />
              <span {...sx(a.skeleton, d.line, d.lineMid)} />
            </div>
          ) : null}
          <p role="status" {...sx(a.srOnly)}>
            {load.status === "loading" ? "Loading details" : ""}
          </p>

          {load.status === "error" ? (
            <div {...sx(d.problem)} role="alert">
              <span {...sx(a.wrap)}>{load.message}</span>
              <button type="button" onClick={onRetry} {...sx(a.btn, a.btnSm, a.btnSecondary)}>
                Try again
              </button>
            </div>
          ) : null}

          {details?.summary ? (
            <div>
              <p {...sx(d.summary)}>{details.summary}</p>
              {details.summarySource === "wikipedia" ? (
                <p {...sx(d.source)}>
                  {details.summaryUrl ? (
                    <a href={details.summaryUrl} target="_blank" rel="noopener noreferrer" {...sx(d.creditLink)}>
                      From Wikipedia
                    </a>
                  ) : (
                    "From Wikipedia"
                  )}
                </p>
              ) : null}
            </div>
          ) : null}

          <Facts details={details} address={address} maps={maps} />
          {details?.placeId ? <p {...sx(d.source)}>Details and photos from Google Maps</p> : null}

          {notes || links.length > 0 ? (
            <div {...sx(d.own)}>
              <p {...sx(a.eyebrow)}>Your notes</p>
              {notes ? <p {...sx(d.notes)}>{notes}</p> : null}
              {links.length > 0 ? (
                <ul {...sx(d.links)}>
                  {links.map((link) => (
                    <li key={link}>
                      <a href={link} target="_blank" rel="noopener noreferrer" {...sx(d.linkRow)}>
                        <Link2 size={16} strokeWidth={1.75} aria-hidden />
                        {hostOf(link)}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {editable ? (
        <div {...sx(d.foot)}>
          <button type="button" onClick={onAddToDay} disabled={locked} {...sx(a.btn, a.btnPrimary, d.primary)}>
            Add to day
          </button>
          <button type="button" onClick={onRemove} disabled={locked} {...sx(a.btn, a.btnGhost)}>
            Remove
          </button>
          {locked ? <p {...sx(d.lockedNote)}>Editing pauses while AI works on the trip.</p> : null}
        </div>
      ) : null}
    </>
  )
}

function Meta({ details }: { details: PlaceDetails | null }) {
  if (!details) return null
  const parts: ReactNode[] = []
  if (details.rating !== undefined) {
    const reviews = details.ratingCount !== undefined ? count.format(details.ratingCount) : null
    parts.push(
      <span key="rating" {...sx(d.metaPart)}>
        <Star {...sx(d.star)} strokeWidth={0} aria-hidden />
        <span aria-hidden>
          {details.rating.toFixed(1)}
          {reviews ? ` · ${reviews}` : ""}
        </span>
        <span {...sx(a.srOnly)}>
          Rated {details.rating.toFixed(1)} out of 5 on Google Maps{reviews ? `, from ${reviews} reviews` : ""}
        </span>
      </span>,
    )
  }
  if (details.priceLevel !== undefined) parts.push(<span key="price" {...sx(d.metaPart)}>{PRICE[details.priceLevel]}</span>)
  if (parts.length === 0) return null
  return (
    <p {...sx(d.meta)}>
      {parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [
              <span key={`sep-${index}`} {...sx(d.sep)} aria-hidden>
                ·
              </span>,
              part,
            ],
      )}
    </p>
  )
}

function Facts({
  details,
  address,
  maps,
}: {
  details: PlaceDetails | null
  address: string | undefined
  maps: ReturnType<typeof externalMapsLink>
}) {
  const website = details?.website
  const phone = details?.phone
  const hours = details?.hours ?? []
  if (!address && !website && !phone && hours.length === 0 && !maps) return null
  return (
    <ul {...sx(d.facts)}>
      {address ? (
        <li {...sx(d.fact)}>
          <MapPin {...sx(d.factIcon)} strokeWidth={1.75} aria-hidden />
          <span {...sx(a.wrap)}>
            <span {...sx(a.srOnly)}>Address: </span>
            {address}
          </span>
        </li>
      ) : null}
      {hours.length > 0 ? (
        <li {...sx(d.fact)}>
          <Clock {...sx(d.factIcon)} strokeWidth={1.75} aria-hidden />
          <details {...sx(stylex.defaultMarker(), d.hours)}>
            <summary {...sx(d.hoursToggle)}>
              Opening hours
              <ChevronDown {...sx(d.chevron)} strokeWidth={1.75} aria-hidden />
            </summary>
            <dl {...sx(d.week)}>
              {hours.map((line) => {
                const [day, time] = splitDay(line)
                return (
                  <Fragment key={line}>
                    <dt {...sx(d.weekDay)}>{day}</dt>
                    <dd {...sx(d.weekTime)}>{time}</dd>
                  </Fragment>
                )
              })}
            </dl>
          </details>
        </li>
      ) : null}
      {website ? (
        <li {...sx(d.fact)}>
          <a href={website} target="_blank" rel="noopener noreferrer" {...sx(d.factLink)}>
            <Globe {...sx(d.factIcon)} strokeWidth={1.75} aria-hidden />
            <span {...sx(a.wrap)}>{hostOf(website)}</span>
          </a>
        </li>
      ) : null}
      {phone ? (
        <li {...sx(d.fact)}>
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} {...sx(d.factLink)}>
            <Phone {...sx(d.factIcon)} strokeWidth={1.75} aria-hidden />
            <span>{phone}</span>
          </a>
        </li>
      ) : null}
      {maps ? (
        <li {...sx(d.fact)}>
          <a href={maps.href} target="_blank" rel="noopener noreferrer" {...sx(d.factLink)}>
            <MapIcon {...sx(d.factIcon)} strokeWidth={1.75} aria-hidden />
            <span>{maps.label}</span>
          </a>
        </li>
      ) : null}
    </ul>
  )
}

/**
 * Photos side by side on a snapping track: swipe on a phone, previous / next
 * or the arrow keys elsewhere. Each carries its author, as Google's terms
 * require; one that fails to load (an expired link) drops out.
 */
function Carousel({
  name,
  photos,
  close,
  onBroken,
}: {
  name: string
  photos: PlacePhoto[]
  close: ReactNode
  onBroken: (url: string) => void
}) {
  const track = useRef<HTMLUListElement>(null)
  const [index, setIndex] = useState(0)
  const reduce = useReducedMotion()
  const total = photos.length
  const at = Math.min(index, total - 1)

  const go = (to: number) => {
    const node = track.current
    const next = Math.max(0, Math.min(total - 1, to))
    setIndex(next)
    node?.scrollTo?.({ left: next * node.clientWidth, behavior: reduce ? "auto" : "smooth" })
  }
  const onScroll = () => {
    const node = track.current
    if (!node || node.clientWidth === 0) return
    const shown = Math.round(node.scrollLeft / node.clientWidth)
    if (shown !== index) setIndex(shown)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    go(at + (event.key === "ArrowRight" ? 1 : -1))
  }

  return (
    <div {...sx(d.photos)} role="group" aria-roledescription="carousel" aria-label={`Photos of ${name}`}>
      <ul ref={track} tabIndex={total > 1 ? 0 : -1} aria-label={total > 1 ? "Photos, use the arrow keys to move between them" : undefined} onScroll={onScroll} onKeyDown={onKeyDown} {...sx(d.track)}>
        {photos.map((photo, i) => (
          <li key={photo.url} {...sx(d.slide)} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${total}`}>
            <figure {...sx(d.figure)}>
              <div {...sx(d.frame)}>
                <img
                  src={photo.url}
                  alt={`${name}, photo ${i + 1} of ${total}`}
                  width={photo.width}
                  height={photo.height}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => onBroken(photo.url)}
                  {...sx(d.img)}
                />
              </div>
              <figcaption {...sx(d.credit)}>
                {photo.author ? (
                  <>
                    Photo:{" "}
                    {photo.author.uri ? (
                      <a href={photo.author.uri} target="_blank" rel="noopener noreferrer" tabIndex={i === at ? 0 : -1} {...sx(d.creditLink)}>
                        {photo.author.name}
                      </a>
                    ) : (
                      photo.author.name
                    )}
                  </>
                ) : null}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {total > 1 ? (
        <>
          <span {...sx(d.overlayChip)} aria-hidden>
            {at + 1} / {total}
          </span>
          <button type="button" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous photo" {...sx(d.overlayBtn, d.step, d.prev)}>
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" onClick={() => go(at + 1)} disabled={at === total - 1} aria-label="Next photo" {...sx(d.overlayBtn, d.step, d.next)}>
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </>
      ) : null}
      {close}
    </div>
  )
}
