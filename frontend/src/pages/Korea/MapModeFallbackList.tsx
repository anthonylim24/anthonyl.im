import type { StyleXStyles } from '@stylexjs/stylex'
import { sx } from '@/styles/merge'
import { mapModeFallbackList } from './MapModeFallbackList.stylex'
import { mapRingStyles } from './korea.stylex'
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

const groupRingStyle: Record<GroupKey, StyleXStyles> = {
  instagram: mapRingStyles.rose,
  scheduled: mapRingStyles.rose,
  core: mapRingStyles.amber,
  supplemental: mapRingStyles.stone,
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
    <div {...sx(mapModeFallbackList.s4e866be9)}>
      {isEmpty ? (
        <div {...sx(mapModeFallbackList.sdc684ab6)}>
          No places match these filters yet.
        </div>
      ) : (
        groupOrder.map((key) =>
          groups[key].length > 0 ? (
            <section key={key} {...sx(mapModeFallbackList.s3301fd)}>
              <h3 {...sx(mapModeFallbackList.s9753f809)}>
                {key === "instagram" && <IgIcon style={mapModeFallbackList.s4dc0fe02} aria-hidden />}
                {groupLabel[key]} · {groups[key].length}
              </h3>
              <ul {...sx(mapModeFallbackList.sc7133e97)}>
                {groups[key].map((p, i) => (
                  <motion.li
                    key={p.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : Math.min(i * 0.03, 0.3) }}
                  >
                    <PlaceListRow place={p} onSelect={onSelect} ringStyle={groupRingStyle[key]} />
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
  ringStyle: StyleXStyles
}

function PlaceListRow({ place, onSelect, ringStyle }: PlaceListRowProps) {
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
      {...sx(mapModeFallbackList.s8151f851, 'group')}
    >
      {/* Thumbnail with photo + category-tinted gradient fallback */}
      <span
        aria-hidden
        {...sx(mapModeFallbackList.thumb, ringStyle)}
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
            {...sx(mapModeFallbackList.s2b57d061)}
          />
        ) : null}
        <span {...sx(mapModeFallbackList.emoji, photoUrl ? mapModeFallbackList.emojiOverlay : undefined)}>
          {place.icon}
        </span>
      </span>

      <div {...sx(mapModeFallbackList.se30fd43e)}>
        <span {...sx(mapModeFallbackList.s3c773e07)}>
          <p {...sx(mapModeFallbackList.s70d2fcb0)}>
            {place.name}
          </p>
          {place.instagramUrl && (
            <a
              href={place.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${place.name} on Instagram (opens in new tab)`}
              onClick={(e) => e.stopPropagation()}
              {...sx(mapModeFallbackList.s6556428b)}
            >
              <IgIcon style={mapModeFallbackList.scd31254b} aria-hidden />
            </a>
          )}
        </span>
        <p {...sx(mapModeFallbackList.s6119d1dd)}>{place.category}</p>
        <p {...sx(mapModeFallbackList.s5c530547)}>{place.reason}</p>
      </div>

      <div {...sx(mapModeFallbackList.s66e542c7)}>
        {place.distanceLabel && (
          <span
            {...sx(mapModeFallbackList.s2cd71914)}
            style={{ background: place.color + "26", color: place.color }}
          >
            {place.distanceLabel}
          </span>
        )}
        {walking && (
          <span {...sx(mapModeFallbackList.s2761a5d3)}>
            <Footprints {...sx(mapModeFallbackList.scd31254b)} aria-hidden />
            {walking}
          </span>
        )}
      </div>
    </button>
  )
}
