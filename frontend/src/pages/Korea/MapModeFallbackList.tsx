import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Footprints } from "lucide-react"
import { IgIcon } from "./IgIcon"
import type { RankedPlace } from "./mapModeTypes"
import { lookupPhoto, formatWalkingTime } from "./placePhoto"

interface MapModeFallbackListProps {
  places: RankedPlace[]
  onSelect: (place: RankedPlace) => void
}

type GroupKey = "instagram" | "scheduled" | "core" | "supplemental"

const groupOrder: GroupKey[] = ["instagram", "scheduled", "core", "supplemental"]

const groupLabel: Record<GroupKey, string> = {
  instagram: "From Instagram",
  scheduled: "Scheduled",
  core: "Core",
  supplemental: "Nearby",
}

const groupRingColor: Record<GroupKey, string> = {
  instagram: "ring-rose-400 dark:ring-rose-500",
  scheduled: "ring-rose-400 dark:ring-rose-500",
  core: "ring-amber-400 dark:ring-amber-500",
  supplemental: "ring-stone-300 dark:ring-stone-700",
}

// Renders the same data as the 3D bubble graph but as a list. Used as both:
//   - the WebGL-unavailable fallback
//   - the user's explicit "List" view mode
export function MapModeFallbackList({ places, onSelect }: MapModeFallbackListProps) {
  const reduce = useReducedMotion()

  const groups: Record<GroupKey, RankedPlace[]> = {
    instagram: [],
    scheduled: [],
    core: [],
    supplemental: [],
  }
  for (const p of places) {
    // IG-saved places have their own bucket so they don't drown the
    // reservation-anchored Scheduled section.
    if (p.subcategory === "instagram") groups.instagram.push(p)
    else groups[p.priority].push(p)
  }

  const isEmpty = places.length === 0

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-4 sm:px-6">
      {isEmpty ? (
        <div className="mt-16 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-400">
          No places match these filters yet.
        </div>
      ) : (
        groupOrder.map((key) =>
          groups[key].length > 0 ? (
            <section key={key} className="mb-5">
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400">
                {key === "instagram" && <IgIcon className="h-3 w-3 text-rose-500" aria-hidden />}
                {groupLabel[key]} · {groups[key].length}
              </h3>
              <ul className="space-y-2">
                {groups[key].map((p, i) => (
                  <motion.li
                    key={p.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : Math.min(i * 0.03, 0.3) }}
                  >
                    <PlaceListRow place={p} onSelect={onSelect} ringClass={groupRingColor[key]} />
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : null,
        )
      )}
    </div>
  )
}

interface PlaceListRowProps {
  place: RankedPlace
  onSelect: (place: RankedPlace) => void
  ringClass: string
}

function PlaceListRow({ place, onSelect, ringClass }: PlaceListRowProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const walking = formatWalkingTime(place.distanceMeters)

  useEffect(() => {
    let cancelled = false
    // List rows render the photo at ~64 px square — a 240 px thumbnail
    // is more than enough for retina without bloating transfer size.
    lookupPhoto([place.name.split("(")[0].trim(), place.name], { size: 240 })
      .then((url) => {
        if (!cancelled && url) setPhotoUrl(url)
      })
      .catch(() => {
        /* keep gradient fallback */
      })
    return () => {
      cancelled = true
    }
  }, [place.name])

  return (
    <button
      type="button"
      onClick={() => onSelect(place)}
      aria-label={`Open ${place.name} details`}
      className="group flex w-full items-start gap-3 rounded-2xl border border-stone-200 bg-white/80 p-3.5 text-left shadow-sm transition hover:-translate-y-px hover:border-rose-300 hover:bg-rose-50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-rose-700 dark:hover:bg-rose-950/30"
    >
      {/* Thumbnail with photo + category-tinted gradient fallback */}
      <span
        aria-hidden
        className={"relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl text-2xl ring-2 " + ringClass}
        style={{
          background: photoUrl
            ? `linear-gradient(135deg, ${place.color}33, ${place.color}11)`
            : `linear-gradient(135deg, ${place.color}55, ${place.color}22)`,
        }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <span className={"relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] " + (photoUrl ? "absolute right-0.5 bottom-0.5 text-base" : "")}>
          {place.icon}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <p className="break-words text-sm font-semibold leading-snug text-stone-900 dark:text-stone-100">
            {place.name}
          </p>
          {place.instagramUrl && (
            <a
              href={place.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${place.name} on Instagram (opens in new tab)`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center text-stone-400 transition hover:text-rose-600 dark:text-stone-500 dark:hover:text-rose-400"
            >
              <IgIcon className="h-3 w-3" aria-hidden />
            </a>
          )}
        </span>
        <p className="mt-0.5 text-xs capitalize text-stone-500 dark:text-stone-400">{place.category}</p>
        <p className="mt-1 line-clamp-2 text-xs text-stone-600 dark:text-stone-400">{place.reason}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {place.distanceLabel && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums leading-none"
            style={{ background: place.color + "26", color: place.color }}
          >
            {place.distanceLabel}
          </span>
        )}
        {walking && (
          <span className="inline-flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400">
            <Footprints className="h-3 w-3" aria-hidden />
            {walking}
          </span>
        )}
      </div>
    </button>
  )
}
