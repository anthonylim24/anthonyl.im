import { sx } from '@/styles/merge'
import { mapModeFilterBar } from './MapModeFilterBar.stylex'
import { motion } from "motion/react"
import type { LucideIcon } from "lucide-react"
import {
  Building2,
  Calendar,
  Coffee,
  FerrisWheel,
  Landmark,
  MapPinned,
  Martini,
  Mountain,
  ShoppingBag,
  Sparkles,
  Star,
  TrainFront,
  TreePine,
  Utensils,
} from "lucide-react"
import type { BusynessLevel, PlacePriority, RankedPlace } from "./mapModeTypes"
import { BusynessBadge } from "./BusynessBadge"

interface MapModeFilterBarProps {
  places: RankedPlace[]
  enabledCategories: Set<string>
  enabledPriorities: Set<PlacePriority>
  enabledBusyness: Set<BusynessLevel>
  onSoloSelect: (cat: string) => void
  onSoloPriority: (priority: PlacePriority) => void
  onSoloBusyness: (level: BusynessLevel) => void
  onReset: () => void
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  hotel: Building2,
  palace: Landmark,
  museum: Landmark,
  shrine: Landmark,
  market: ShoppingBag,
  shopping: ShoppingBag,
  cafe: Coffee,
  restaurant: Utensils,
  bar: Martini,
  park: TreePine,
  viewpoint: Mountain,
  experience: FerrisWheel,
  transit: TrainFront,
  neighborhood: MapPinned,
  venue: Sparkles,
  landmark: MapPinned,
}

const PRIORITY_META: {
  id: PlacePriority
  label: string
  Icon: LucideIcon
  tint: string
}[] = [
  { id: "scheduled", label: "Scheduled", Icon: Calendar, tint: "#F43F5E" },
  { id: "core", label: "Core", Icon: Star, tint: "#F59E0B" },
  { id: "supplemental", label: "Extra", Icon: Sparkles, tint: "#A8A29E" },
]

const BUSYNESS_ORDER: BusynessLevel[] = ["quiet", "moderate", "busy", "very_busy"]

export function MapModeFilterBar({
  places,
  enabledCategories,
  enabledPriorities,
  enabledBusyness,
  onSoloSelect,
  onSoloPriority,
  onSoloBusyness,
  onReset,
}: MapModeFilterBarProps) {
  const counts = new Map<string, number>()
  for (const p of places) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  const cats = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])

  const priorityCounts = new Map<PlacePriority, number>()
  for (const p of places) priorityCounts.set(p.priority, (priorityCounts.get(p.priority) ?? 0) + 1)

  const busynessCounts = new Map<BusynessLevel, number>()
  for (const p of places) {
    if (p.busyness) busynessCounts.set(p.busyness, (busynessCounts.get(p.busyness) ?? 0) + 1)
  }
  const availableBusyness = BUSYNESS_ORDER.filter((lvl) => (busynessCounts.get(lvl) ?? 0) > 0)

  const atDefault =
    enabledCategories.size === 0 &&
    enabledPriorities.size === 2 &&
    enabledPriorities.has("scheduled") &&
    enabledPriorities.has("core") &&
    enabledBusyness.size === 0

  return (
    <div
      {...sx(mapModeFilterBar.se7e9cd2a)}
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 72px)" }}
    >
      <motion.nav
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
        aria-label="Filter places"
        {...sx(mapModeFilterBar.s3c9fde5a)}
        style={{
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)",
        }}
      >
        <button
          type="button"
          onClick={onReset}
          aria-pressed={atDefault}
          aria-label={`Show default places (${places.length} total)`}
          {...sx(
            mapModeFilterBar.resetChip,
            atDefault ? mapModeFilterBar.resetActive : mapModeFilterBar.resetInactive,
          )}
        >
          All · {places.length}
        </button>

        {PRIORITY_META.map((meta) => {
          const count = priorityCounts.get(meta.id) ?? 0
          if (count === 0) return null
          const enabled = enabledPriorities.has(meta.id)
          const Icon = meta.Icon
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => onSoloPriority(meta.id)}
              aria-pressed={enabled}
              title={`${meta.label} · ${count}`}
              {...sx(
                mapModeFilterBar.filterChip,
                enabled ? mapModeFilterBar.filterChipOn : mapModeFilterBar.filterChipOff,
              )}
              style={enabled ? { backgroundColor: meta.tint } : undefined}
            >
              <Icon {...sx(mapModeFilterBar.se5124f8)} aria-hidden />
              <span>{meta.label}</span>
              <span {...sx(mapModeFilterBar.se2d7d07e)}>{count}</span>
            </button>
          )
        })}

        <span aria-hidden {...sx(mapModeFilterBar.sfc1c62a2)} />

        {cats.map(([cat, count]) => {
          const enabled = enabledCategories.has(cat)
          const Icon = CATEGORY_ICON[cat] ?? MapPinned
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSoloSelect(cat)}
              aria-pressed={enabled}
              title={`${cat} · ${count}`}
              {...sx(
                mapModeFilterBar.filterChip,
                enabled ? mapModeFilterBar.categoryChipOn : mapModeFilterBar.filterChipOff,
              )}
            >
              <Icon {...sx(mapModeFilterBar.se5124f8)} aria-hidden />
              <span {...sx(mapModeFilterBar.s96c27eec)}>{cat}</span>
              <span {...sx(mapModeFilterBar.se2d7d07e)}>{count}</span>
            </button>
          )
        })}

        {availableBusyness.length > 0 && (
          <>
            <span aria-hidden {...sx(mapModeFilterBar.sfc1c62a2)} />
            {availableBusyness.map((lvl) => {
              const count = busynessCounts.get(lvl) ?? 0
              const enabled = enabledBusyness.has(lvl)
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onSoloBusyness(lvl)}
                  aria-pressed={enabled}
                  title={`Busyness: ${lvl} · ${count}`}
                  {...sx(
                    mapModeFilterBar.filterChip,
                    enabled ? mapModeFilterBar.categoryChipOn : mapModeFilterBar.filterChipOff,
                  )}
                >
                  <BusynessBadge
                    busyness={lvl}
                    size="sm"
                    style={enabled ? mapModeFilterBar.busynessTransparent : undefined}
                  />
                  <span {...sx(mapModeFilterBar.sbaaf3ae1)}>{count}</span>
                </button>
              )
            })}
          </>
        )}
      </motion.nav>
    </div>
  )
}
