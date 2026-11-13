import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowRight, Check, ClipboardPaste, ExternalLink, Film, Link2, Plus, RotateCw, Search, Trash2, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { errorMessage } from "../../../effect/errors"
import { a } from "../atlas.stylex"
import { Spinner } from "../components/kit"
import { AtlasMap } from "../map/AtlasMap"
import { centroid, corePoints, distanceMeters, isLocated, type AtlasPin, type LngLat } from "../map/geo"
import { itemIcon, plural, resolveAccent } from "../meta"
import type { ItineraryItem, Trip } from "../types"
import { bestDayFor, dayWithPlace, extractInstagramUrls, jobProgress, placeCategory, placeWhere, postLabel, stopFromPlace } from "./instagram"
import { IgGlyph } from "./IgGlyph"
import { ig as s } from "./instagram.stylex"
import { listSaved, removeSaved, type GetToken, type IgJob, type IgPlace, type SavedPlace } from "./instagramApi"
import { useInstagramImport } from "./useInstagramImport"

// "From Instagram": paste a post or Reel, watch it being read, and drop the
// places it names onto a day. Everything found is kept under Saved, so a
// place from last month's Reel is one tap away on any trip.

const WIDE_QUERY = "(min-width: 900px)"
const PIPELINE = ["fetching", "bundling", "extracting", "geocoding"]

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches))
  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia(query)
    const sync = () => setMatches(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [query])
  return matches
}

export interface InstagramSheetProps {
  open: boolean
  onClose: () => void
  trip: Trip
  /** The day in view, if any: where places go unless the traveller picks another. */
  dayId?: string
  /** Links handed over from the composer: read straight away. */
  initialUrls?: readonly string[]
  getToken: GetToken
  onAdd: (dayId: string, items: ItineraryItem[]) => void
}

/** Clipboard read needs a secure context and browser support. */
const canReadClipboard =
  typeof navigator !== "undefined" && typeof (navigator as { clipboard?: Partial<Clipboard> }).clipboard?.readText === "function"

/** Saved places within this distance of the trip are listed first. */
const NEAR_M = 150_000

const pinId = (place: Pick<IgPlace, "id">) => `ig-${place.id}`

export function InstagramSheet({ open, onClose, trip, dayId, initialUrls, getToken, onAdd }: InstagramSheetProps) {
  const imp = useInstagramImport(getToken, open)
  const wide = useMedia(WIDE_QUERY)
  const [tab, setTab] = useState<"posts" | "saved">("posts")
  const [text, setText] = useState("")
  const [target, setTarget] = useState<string>(dayId ?? "auto")
  const [hot, setHot] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ places: SavedPlace[]; total: number; hasMore: boolean } | null>(null)
  const [query, setQuery] = useState("")
  const [savedBusy, setSavedBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const started = useRef("")
  const savedSeq = useRef(0)

  const urls = extractInstagramUrls(text)
  const accent = resolveAccent(trip.appearance?.accent)

  useEffect(() => {
    if (open) setTarget(dayId ?? "auto")
  }, [open, dayId])

  // Links from the composer start reading as the sheet opens.
  const handoff = (initialUrls ?? []).join(" ")
  useEffect(() => {
    if (!open || !handoff || started.current === handoff) return
    started.current = handoff
    setTab("posts")
    void imp.submit(handoff.split(" "))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, handoff])
  useEffect(() => {
    if (!open) started.current = ""
  }, [open])

  const loadSaved = async (q: string, offset = 0) => {
    const mine = ++savedSeq.current
    setSavedBusy(true)
    try {
      const page = await listSaved(getToken, { q, offset })
      if (mine !== savedSeq.current) return
      setSaved((current) => (offset > 0 && current ? { ...page, places: [...current.places, ...page.places] } : page))
    } catch {
      if (mine === savedSeq.current) setSaved((current) => current ?? { places: [], total: 0, hasMore: false })
    } finally {
      if (mine === savedSeq.current) setSavedBusy(false)
    }
  }

  // The Saved count shows on the tab, so load it with the sheet; search is debounced.
  useEffect(() => {
    if (!open || imp.status !== "ready") return
    const timer = setTimeout(() => void loadSaved(query), query ? 220 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imp.status, query])

  const dayFor = (place: IgPlace) => {
    const chosen = target === "auto" ? undefined : trip.days.find((d) => d.id === target)
    return chosen ?? bestDayFor(trip, place)
  }
  const dayNumber = (id: string) => trip.days.findIndex((d) => d.id === id) + 1

  const add = (places: IgPlace[], postUrl?: string | ((place: IgPlace) => string | undefined)) => {
    const byDay = new Map<string, ItineraryItem[]>()
    for (const place of places) {
      if (dayWithPlace(trip, place) != null) continue
      const day = dayFor(place)
      if (!day) continue
      const url = typeof postUrl === "function" ? postUrl(place) : postUrl
      byDay.set(day.id, [...(byDay.get(day.id) ?? []), stopFromPlace(place, url)])
    }
    for (const [id, items] of byDay) onAdd(id, items)
  }

  const removeFromSaved = async (place: SavedPlace) => {
    setSaved((current) =>
      current ? { ...current, places: current.places.filter((p) => p.id !== place.id), total: Math.max(0, current.total - 1) } : current,
    )
    try {
      await removeSaved(getToken, place.id)
    } catch (err) {
      imp.setProblem(`Couldn’t remove that place. (${errorMessage(err)})`)
      void loadSaved(query)
    }
  }

  const submit = (list: string[]) => {
    if (list.length === 0) return
    setText("")
    setTab("posts")
    void imp.submit(list)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit(urls)
  }

  // Pasting a link is the whole gesture: no second tap.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const found = extractInstagramUrls(event.clipboardData.getData("text"))
    if (found.length === 0) return
    event.preventDefault()
    submit(found)
  }

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText()
      const found = extractInstagramUrls(clip)
      if (found.length > 0) submit(found)
      else {
        setText(clip.trim().slice(0, 300))
        inputRef.current?.focus()
      }
    } catch {
      inputRef.current?.focus()
    }
  }

  const jobs = useMemo(() => [...imp.session, ...imp.recent], [imp.session, imp.recent])
  // Saved places are for every trip; the ones near this trip come first.
  const tripCenter = useMemo<LngLat | null>(
    () =>
      centroid(trip.days.flatMap((d) => d.items.filter(isLocated).map((i) => ({ lat: i.location.lat, lng: i.location.lng })))) ??
      trip.center ??
      null,
    [trip.days, trip.center],
  )
  const isNear = (place: IgPlace) =>
    tripCenter != null && place.lat != null && place.lng != null && distanceMeters(tripCenter, { lat: place.lat, lng: place.lng }) < NEAR_M
  const savedNear = (saved?.places ?? []).filter(isNear)
  const savedFar = (saved?.places ?? []).filter((place) => !isNear(place))
  const shown: IgPlace[] = tab === "posts" ? jobs.flatMap((job) => job.places) : savedNear.length > 0 ? savedNear : savedFar
  const pins = useMemo<AtlasPin[]>(() => {
    const seen = new Set<number>()
    const out: AtlasPin[] = []
    for (const place of shown) {
      if (place.lat == null || place.lng == null || seen.has(place.id)) continue
      seen.add(place.id)
      const on = dayWithPlace(trip, place)
      out.push({
        id: pinId(place),
        title: place.name,
        lat: place.lat,
        lng: place.lng,
        variant: on != null ? "stop" : "dot",
        label: on != null ? "✓" : undefined,
      })
    }
    return out.slice(0, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((p) => p.id).join(","), trip.days])

  const map =
    pins.length > 0 ? (
      <AtlasMap
        pins={pins}
        frameKey={pins.map((p) => p.id).join(",")}
        framePoints={corePoints(pins)}
        restCenter={trip.center ?? undefined}
        restZoom={10}
        maxZoom={15}
        padding={wide ? { top: 96, right: 96, bottom: 72, left: 72 } : { top: 30, right: 30, bottom: 26, left: 30 }}
        hotId={hot}
        activeId={hot}
        bare={!wide}
        flat
        onHover={setHot}
        onSelect={(id) => {
          setHot(id)
          listRef.current?.querySelector(`[data-pin="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
        }}
        label={`Map of ${plural(pins.length, "place")} from Instagram`}
      >
        {wide && (
          <p {...sx(s.mapNote)}>
            {plural(pins.length, "place")}
            {tab === "saved" && savedNear.length > 0 ? " near this trip" : ""}
            {pins.some((pin) => pin.variant === "stop") ? " · ticked are on the trip" : ""}
          </p>
        )}
      </AtlasMap>
    ) : null

  const hint =
    imp.problem ??
    (text.trim() !== "" && urls.length === 0 ? "That doesn’t look like an Instagram link. In Instagram: Share, then Copy link." : null)
  const savedTotal = saved?.total ?? 0

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <div className="trips trips-portal" data-trip-accent={accent}>
          <DialogPrimitive.Overlay {...sx(a.scrim)} />
          <DialogPrimitive.Content
            {...sx(a.dialog, s.sheet)}
            onOpenAutoFocus={(event) => {
              // Typing position on desktop; on phones, and when a link was
              // handed over, don't raise the keyboard over the results.
              event.preventDefault()
              if (wide && !handoff) inputRef.current?.focus()
              else (event.currentTarget as HTMLElement).focus()
            }}
          >
            <div {...sx(s.body)}>
              <div {...sx(s.column)}>
                <div {...sx(s.head)}>
                  <div>
                    <p {...sx(a.eyebrow, jobs.length > 0 && s.ledeQuiet)}>Import</p>
                    <DialogPrimitive.Title {...sx(s.title, jobs.length > 0 && s.titleQuiet)}>
                      Places from <span {...sx(a.italic)}>Instagram</span>
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description {...sx(s.lede, jobs.length > 0 && a.srOnly)}>
                      Paste a post or Reel. Every place it names gets pinned, ready to add to a day.
                    </DialogPrimitive.Description>
                  </div>
                  <DialogPrimitive.Close {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Close">
                    <X size={18} strokeWidth={1.75} aria-hidden />
                  </DialogPrimitive.Close>
                </div>

                {imp.status === "unconfigured" ? (
                  <div {...sx(s.scroll)}>
                    <div {...sx(a.notice)} role="status">
                      Instagram import isn’t switched on for this server yet. You can still add places by name from any day.
                    </div>
                  </div>
                ) : (
                  <>
                    <form {...sx(s.paste)} onSubmit={onSubmit}>
                      <Link2 size={18} strokeWidth={1.75} aria-hidden {...sx(a.noShrink)} />
                      <input
                        ref={inputRef}
                        type="text"
                        inputMode="url"
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        enterKeyHint="go"
                        aria-label="Instagram post or Reel link"
                        aria-describedby={hint ? "ig-paste-hint" : undefined}
                        placeholder="Paste a post or Reel link"
                        value={text}
                        {...sx(a.fieldBare, s.pasteInput)}
                        onChange={(event) => setText(event.target.value)}
                        onPaste={onPaste}
                      />
                      {text.trim() === "" && canReadClipboard ? (
                        <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={() => void pasteFromClipboard()}>
                          <ClipboardPaste size={14} strokeWidth={1.75} aria-hidden />
                          Paste
                        </button>
                      ) : (
                        <button type="submit" {...sx(a.btn, a.btnPrimary, a.btnSm)} disabled={urls.length === 0 || imp.submitting}>
                          {imp.submitting ? <Spinner /> : <ArrowRight size={14} strokeWidth={2} aria-hidden />}
                          {urls.length > 1 ? `Read ${urls.length} posts` : "Find places"}
                        </button>
                      )}
                    </form>
                    {hint && (
                      <p id="ig-paste-hint" {...sx(a.small, s.pasteHint)} role={imp.problem ? "alert" : "status"}>
                        {hint}
                      </p>
                    )}

                    <div {...sx(s.tabs)} role="tablist" aria-label="Instagram places">
                      <button type="button" role="tab" id="ig-tab-posts" aria-selected={tab === "posts"} aria-controls="ig-panel" {...sx(s.tab, tab === "posts" && s.tabOn)} onClick={() => setTab("posts")}>
                        Posts
                      </button>
                      <button type="button" role="tab" id="ig-tab-saved" aria-selected={tab === "saved"} aria-controls="ig-panel" {...sx(s.tab, tab === "saved" && s.tabOn)} onClick={() => setTab("saved")}>
                        Saved
                        {savedTotal > 0 && <span {...sx(s.tabCount)}>{savedTotal}</span>}
                      </button>
                    </div>

                    <div {...sx(s.scroll)} ref={listRef} role="tabpanel" id="ig-panel" aria-labelledby={tab === "posts" ? "ig-tab-posts" : "ig-tab-saved"}>
                      {/* The strip is for the post being read; the library is a list first. */}
                      {!wide && map && tab === "posts" && <div {...sx(s.mapStrip)}>{map}</div>}

                      {tab === "posts" &&
                        imp.pendingUrls.map((url) => (
                          <section key={url} {...sx(s.post)} aria-label="Sending the link">
                            <div {...sx(s.postHead)}>
                              <span {...sx(s.glyph)}>
                                <IgGlyph />
                              </span>
                              <div {...sx(a.grow)} style={{ minWidth: 0 }}>
                                <p {...sx(s.postName, a.truncate)}>{/\/reels?\//i.test(url) ? "Instagram Reel" : "Instagram post"}</p>
                                <p {...sx(s.postCaption, a.truncate)}>{url.replace(/^https?:\/\/(www\.)?/, "").replace(/\?.*$/, "")}</p>
                              </div>
                            </div>
                            <div {...sx(s.working)} role="progressbar" aria-label="Opening the post" aria-valuemin={0} aria-valuemax={100} aria-valuenow={3}>
                              <Spinner />
                              <span>Opening the post…</span>
                              <span {...sx(s.steps)} aria-hidden>
                                {PIPELINE.map((step) => (
                                  <span key={step} {...sx(s.step)} />
                                ))}
                              </span>
                            </div>
                          </section>
                        ))}
                      {tab === "posts" ? (
                        imp.pendingUrls.length > 0 && jobs.length === 0 ? null : imp.status === "loading" ? (
                          <>
                            <div {...sx(a.skeleton, s.skeletonRow)} />
                            <div {...sx(a.skeleton, s.skeletonRow)} />
                          </>
                        ) : jobs.length === 0 ? (
                          <ol {...sx(s.how)}>
                            {[
                              "In Instagram, open a post or Reel and choose Share, then Copy link.",
                              "Paste it above. We read the caption, the comments and, if needed, the video.",
                              "Add the places you like to a day. They land on the map straight away.",
                            ].map((line, i) => (
                              <li key={line} {...sx(s.howRow)}>
                                <span {...sx(s.howNum)}>{String(i + 1).padStart(2, "0")}</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <>
                            {imp.session.map((job) => (
                              <PostCard
                                key={job.id}
                                job={job}
                                trip={trip}
                                hot={hot}
                                deepening={imp.deepening.has(job.id)}
                                dayLabel={(place) => {
                                  const day = dayFor(place)
                                  return day ? `Day ${dayNumber(day.id)}` : ""
                                }}
                                onHover={setHot}
                                onAdd={(places) => add(places, job.url)}
                                onRetry={() => void imp.retry(job)}
                                onDeepen={() => void imp.deepen(job)}
                              />
                            ))}
                            {imp.recent.length > 0 && (
                              <>
                                <p {...sx(a.eyebrow, s.groupLabel)}>{imp.session.length > 0 ? "Earlier" : "Recent posts"}</p>
                                {imp.recent.map((job) => (
                                  <PostCard
                                    key={job.id}
                                    job={job}
                                    trip={trip}
                                    hot={hot}
                                    deepening={imp.deepening.has(job.id)}
                                    dayLabel={(place) => {
                                      const day = dayFor(place)
                                      return day ? `Day ${dayNumber(day.id)}` : ""
                                    }}
                                    onHover={setHot}
                                    onAdd={(places) => add(places, job.url)}
                                    onRetry={() => void imp.retry(job)}
                                    onDeepen={() => void imp.deepen(job)}
                                  />
                                ))}
                              </>
                            )}
                          </>
                        )
                      ) : (
                        <>
                          <label {...sx(s.search)}>
                            <Search size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink)} />
                            <span {...sx(a.srOnly)}>Search saved places</span>
                            <input
                              type="search"
                              placeholder="Search saved places"
                              value={query}
                              {...sx(a.fieldBare)}
                              onChange={(event) => setQuery(event.target.value)}
                            />
                            {savedBusy && <Spinner />}
                          </label>
                          {saved === null ? (
                            <>
                              <div {...sx(a.skeleton, s.skeletonRow)} />
                              <div {...sx(a.skeleton, s.skeletonRow)} />
                              <div {...sx(a.skeleton, s.skeletonRow)} />
                            </>
                          ) : saved.places.length === 0 ? (
                            <p {...sx(a.body)}>
                              {query
                                ? `Nothing saved matches “${query}”.`
                                : "Nothing saved yet. Every place you pull from a post is kept here for all your trips."}
                            </p>
                          ) : (
                            [savedNear, savedFar].map(
                              (group, g) =>
                                group.length > 0 && (
                                  <div key={g} {...sx(a.stack)} style={{ gap: "0.625rem" }}>
                                    {savedNear.length > 0 && savedFar.length > 0 && (
                                      <p {...sx(a.eyebrow)}>{g === 0 ? "Near this trip" : "Elsewhere"}</p>
                                    )}
                                    <div {...sx(s.post)}>
                                      {group.map((place, index) => (
                                        <PlaceRow
                                          key={place.id}
                                          place={place}
                                          first={index === 0}
                                          delay={Math.min(index, 8) * 30}
                                          onDay={dayWithPlace(trip, place)}
                                          dayLabel={(() => {
                                            const day = dayFor(place)
                                            return day ? `Day ${dayNumber(day.id)}` : ""
                                          })()}
                                          source={place.post?.owner_username ? `@${place.post.owner_username}` : undefined}
                                          hot={hot === pinId(place)}
                                          onHover={setHot}
                                          onAdd={() => add([place], place.post?.url)}
                                          onRemove={() => void removeFromSaved(place)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                ),
                            )
                          )}
                          {saved?.hasMore && (
                            <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} style={{ alignSelf: "center" }} disabled={savedBusy} onClick={() => void loadSaved(query, saved.places.length)}>
                              Show more
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    <div {...sx(s.foot)}>
                      <label htmlFor="ig-target" {...sx(a.small, s.footLabel)}>
                        Add to
                      </label>
                      <select id="ig-target" value={target} {...sx(s.daySelect)} onChange={(event) => setTarget(event.target.value)}>
                        <option value="auto">The nearest day</option>
                        {trip.days.map((day, index) => (
                          <option key={day.id} value={day.id}>
                            Day {index + 1}
                            {day.title ? ` · ${day.title}` : day.city ? ` · ${day.city}` : ""}
                          </option>
                        ))}
                      </select>
                      <span {...sx(a.grow)} />
                      <button type="button" {...sx(a.btn, a.btnPrimary)} onClick={onClose}>
                        Done
                      </button>
                    </div>
                  </>
                )}
              </div>

              {wide && (
                <div {...sx(s.mapSide)}>
                  {map ? (
                    <div {...sx(s.mapFill)}>{map}</div>
                  ) : (
                    <div {...sx(s.mapEmpty)}>
                      <div {...sx(s.mapEmptyCard)}>
                        <p {...sx(a.eyebrow)}>The map</p>
                        <p {...sx(s.mapEmptyTitle)}>
                          Places appear <span {...sx(a.italic)}>here</span>
                        </p>
                        <p {...sx(a.small)}>Each place a post names is pinned as soon as it is found.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PostCard({
  job,
  trip,
  hot,
  deepening,
  dayLabel,
  onHover,
  onAdd,
  onRetry,
  onDeepen,
}: {
  job: IgJob
  trip: Trip
  hot: string | null
  deepening: boolean
  dayLabel: (place: IgPlace) => string
  onHover: (id: string | null) => void
  onAdd: (places: IgPlace[]) => void
  onRetry: () => void
  onDeepen: () => void
}) {
  const progress = jobProgress(job)
  const busy = progress.phase === "working" || deepening
  const caption = job.post_preview?.caption?.replace(/\s+/g, " ").trim()
  const open = job.places.filter((place) => dayWithPlace(trip, place) == null)
  const at = PIPELINE.indexOf(job.step)
  const label = deepening && progress.phase !== "working" ? "Nothing in the caption. Watching the video" : progress.label

  return (
    <section {...sx(s.post)} aria-label={`${postLabel(job)}: ${label}`}>
      <div {...sx(s.postHead)}>
        <span {...sx(s.glyph)}>
          <IgGlyph />
        </span>
        <div {...sx(a.grow)} style={{ minWidth: 0 }}>
          <p {...sx(s.postName, a.truncate)}>{postLabel(job)}</p>
          <p {...sx(s.postCaption, a.truncate)}>{caption || job.url.replace(/^https?:\/\/(www\.)?/, "")}</p>
        </div>
        {!busy && progress.phase === "done" && open.length > 1 ? (
          <button type="button" {...sx(a.btn, a.btnSoft, a.btnSm, a.noShrink)} onClick={() => onAdd(open)}>
            <Plus size={14} strokeWidth={2} aria-hidden />
            Add all {open.length}
          </button>
        ) : (
          !busy && (
            <span {...sx(s.status, progress.phase === "failed" && s.statusBad)} role="status">
              {progress.label}
            </span>
          )
        )}
      </div>

      {busy && (
        <>
          <div
            {...sx(s.working)}
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((deepening && progress.phase !== "working" ? 0.1 : progress.fraction) * 100)}
          >
            <Spinner />
            <span>{label}…</span>
            <span {...sx(s.steps)} aria-hidden>
              {PIPELINE.map((step, i) => (
                <span key={step} {...sx(s.step, progress.phase === "working" && i <= at && s.stepOn)} />
              ))}
            </span>
          </div>
        </>
      )}

      {!busy && progress.phase === "done" && (
        <>
          {job.places.map((place, index) => (
            <PlaceRow
              key={place.id}
              place={place}
              delay={Math.min(index, 8) * 60}
              onDay={dayWithPlace(trip, place)}
              dayLabel={dayLabel(place)}
              hot={hot === pinId(place)}
              onHover={onHover}
              onAdd={() => onAdd([place])}
            />
          ))}
          <div {...sx(s.postFoot)}>
            <span {...sx(a.grow)} />
            {job.skip_video !== false && (
              <button type="button" {...sx(s.quiet)} onClick={onDeepen} title="Read the post again, this time with its video">
                <Film size={14} strokeWidth={1.75} aria-hidden />
                Missing one? Watch the video
              </button>
            )}
            <a href={job.url} target="_blank" rel="noreferrer" {...sx(s.quiet)} aria-label={`Open ${postLabel(job)} on Instagram`}>
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
              Post
            </a>
          </div>
        </>
      )}

      {!busy && progress.phase === "empty" && (
        <div {...sx(s.message)}>
          <span>We read the caption, the comments and the video, and this post doesn’t name a place we could pin.</span>
          <span {...sx(a.rowWrap)}>
            <a href={job.url} target="_blank" rel="noreferrer" {...sx(a.btn, a.btnSecondary, a.btnSm)}>
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
              Open the post
            </a>
            <button type="button" {...sx(s.quiet)} onClick={onDeepen}>
              <RotateCw size={14} strokeWidth={1.75} aria-hidden />
              Read it again
            </button>
          </span>
        </div>
      )}

      {!busy && progress.phase === "failed" && (
        <div {...sx(s.message)} role="alert">
          <span>{progress.problem}</span>
          <span {...sx(a.rowWrap)}>
            {(job.status === "dead" || job.status === "failed") && (
              <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={onRetry}>
                <RotateCw size={14} strokeWidth={1.75} aria-hidden />
                Try again
              </button>
            )}
            <a href={job.url} target="_blank" rel="noreferrer" {...sx(s.quiet)}>
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
              Open the post
            </a>
          </span>
        </div>
      )}
    </section>
  )
}

function PlaceRow({
  place,
  first,
  delay = 0,
  onDay,
  dayLabel,
  source,
  hot,
  onHover,
  onAdd,
  onRemove,
}: {
  place: IgPlace
  first?: boolean
  delay?: number
  /** 1-based day the place is already on. */
  onDay: number | null
  dayLabel: string
  source?: string
  hot: boolean
  onHover: (id: string | null) => void
  onAdd: () => void
  onRemove?: () => void
}) {
  const Icon = itemIcon("place", placeCategory(place.category))
  const where = placeWhere(place)
  const romanized = place.name_romanized?.trim()
  const pinned = place.lat != null && place.lng != null
  const quote = place.supporting_quote?.replace(/\s+/g, " ").trim()
  const id = pinId(place)

  return (
    <div
      {...sx(s.place, first && s.placeFirst, hot && s.placeHot, onRemove && s.placeWrap)}
      style={{ animationDelay: `${delay}ms` }}
      data-pin={id}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      <span {...sx(s.tile)} aria-hidden>
        <Icon size={17} strokeWidth={1.75} />
      </span>
      <div {...sx(a.grow)} style={{ minWidth: 0 }}>
        <p {...sx(s.placeName, a.wrap)}>
          {place.name}
          {romanized && romanized.toLowerCase() !== place.name.toLowerCase() && <span {...sx(s.placeAlt)}> {romanized}</span>}
        </p>
        {(where || source) && <p {...sx(s.placeWhere, a.truncate)}>{[where, source].filter(Boolean).join(" · ")}</p>}
        {quote && <p {...sx(s.quote)}>“{quote}”</p>}
        {(!pinned || place.geocode_disagree || place.confidence_band === "low") && (
          <div {...sx(s.flags)}>
            {!pinned ? (
              <span {...sx(a.chip, a.chipOutline)}>No pin yet</span>
            ) : (
              <span {...sx(a.chip, a.chipOutline)} title="We weren’t sure this is the right spot. Check it on the map after adding.">
                Check the pin
              </span>
            )}
          </div>
        )}
      </div>
      <div {...sx(s.placeActions, onRemove && s.placeActionsWide)}>
        {onDay != null ? (
          <span {...sx(s.added)}>
            <Check size={14} strokeWidth={2} aria-hidden />
            On day {onDay}
          </span>
        ) : (
          <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={onAdd} aria-label={`Add ${place.name} to ${dayLabel.toLowerCase()}`}>
            <Plus size={14} strokeWidth={2} aria-hidden />
            {dayLabel}
          </button>
        )}
        {onRemove && (
          <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label={`Remove ${place.name} from saved`} title="Remove from saved" onClick={onRemove}>
            <Trash2 size={15} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
