import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Globe, Link2, MapPin, Map as MapIcon, Phone, Star, X } from "lucide-react"
import { stylex, sx } from "@/styles/merge"
import { useReducedMotion } from "../../../hooks/useReducedMotion"
import { externalMapsLink } from "../../../lib/externalMaps"
import { a } from "../atlas.stylex"
import { DialogFrame } from "../components/kit"
import type { ItineraryItem } from "../types"
import type { IdeaDetailsProps, PlaceDetails, PlacePhoto } from "./contract"
import { d } from "./details.stylex"
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

const FAILED = "Couldn’t load this place’s details just now."

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
    // `requestKey` names the place and the attempt; `target` is rebuilt on every edit to the idea.
    // `cached` turning false (an answer lapsing while open) asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, getToken, cached])

  const load: DetailsLoad =
    known !== undefined ? { status: "ready", details: known } : answer?.key === requestKey ? answer.load : { status: "loading" }
  return { load, retry: () => setAttempt((n) => n + 1) }
}

export function IdeaDetails({ trip, idea, anchor, editable, locked, getToken, themeControl, onAddToDay, onRemove, onClose }: IdeaDetailsProps) {
  const wide = useWide()
  const target = useMemo(() => detailsTarget(idea), [idea])
  const { load, retry } = usePlaceDetails(target, getToken)
  const titleId = useId()
  const accent = trip.appearance?.accent
  const asPopover = Boolean(anchor && anchor.isConnected && wide)

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
      {idea.title}
    </h2>
  )

  if (asPopover && anchor) {
    return (
      <Popover anchor={anchor} accent={accent} labelledBy={titleId} onClose={onClose}>
        {content(heading(titleId))}
      </Popover>
    )
  }
  return (
    <DialogFrame open onClose={onClose} accent={accent} content={[a.dialog, d.sheet, "trips-glass-sheet"]}>
      <DialogPrimitive.Description {...sx(a.srOnly)}>Details, photos and links for {idea.title}</DialogPrimitive.Description>
      {content(<DialogPrimitive.Title asChild>{heading()}</DialogPrimitive.Title>)}
    </DialogFrame>
  )
}

/** Over the sticky header and the map, like a kit menu. */
const FLOATING = { position: "fixed", right: "auto", bottom: "auto" } as const

const FOCUSABLE = 'a[href], button:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'

/**
 * A non-modal dialog floating beside `anchor`. Focus moves in on open and
 * back to the row on close; Escape and a press outside close it (a press on
 * the row, or in another Trips portal such as the category menu, does not).
 */
function Popover({
  anchor,
  accent,
  labelledBy,
  onClose,
  children,
}: {
  anchor: HTMLElement
  accent?: string
  labelledBy: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => {
    close.current = onClose
  })

  // Placed before it paints, and again when the page scrolls or resizes, or
  // the card's own height changes as its details arrive. Written to the node:
  // nothing in React depends on it.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const place = () => {
      const at = placeBeside({
        anchor: anchor.getBoundingClientRect(),
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
  }, [anchor])

  useEffect(() => {
    const node = ref.current
    node?.focus({ preventScroll: true })
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target || anchor.contains(target) || node?.contains(target) || target.closest?.(".trips-portal")) return
      close.current()
    }
    document.addEventListener("pointerdown", onPointer)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      // Back to the row, unless the traveller has since put focus somewhere else.
      const active = document.activeElement
      if ((!active || active === document.body || node?.contains(active)) && anchor.isConnected) anchor.focus({ preventScroll: true })
    }
  }, [anchor])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      anchor.focus({ preventScroll: true })
      close.current()
      return
    }
    // Tab stays inside the card, as in any dialog; Escape is the way out.
    if (event.key !== "Tab") return
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((node) => !node.closest("[inert]"))
    if (nodes.length === 0) return
    const first = nodes[0]!
    const last = nodes[nodes.length - 1]!
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === ref.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="trips trips-portal" data-trip-accent={accent}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="false"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={FLOATING}
        onKeyDown={onKeyDown}
        {...sx(d.popover, "trips-glass-sheet")}
      >
        {children}
      </div>
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
      ? externalMapsLink({ name: location?.name || idea.title, address, lat: location?.lat, lng: location?.lng, mapsUrl: details?.mapsUrl })
      : undefined
  const notes = idea.notes?.trim()
  const links = [...new Set((idea.links ?? []).map((link) => webUrl(link)).filter((link): link is string => Boolean(link)))]

  return (
    <>
      <div {...sx(d.scroll)} aria-busy={load.status === "loading"}>
        {photos.length > 0 ? (
          <Carousel
            key={photos.map((photo) => photo.url).join(" ")}
            name={idea.title}
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
            </div>
            {themeControl}
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
