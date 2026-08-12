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

const chipFocus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60"

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
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 72px)" }}
    >
      <motion.nav
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
        aria-label="Filter places"
        className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-[rgba(28,25,23,0.08)] bg-[rgba(255,254,250,0.88)] px-2 py-1.5 shadow-[0_8px_28px_rgba(28,25,23,0.08)] backdrop-blur-xl sm:max-w-3xl dark:border-[rgba(255,252,245,0.06)] dark:bg-[rgba(28,25,23,0.78)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
          className={
            "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition " +
            chipFocus +
            " " +
            (atDefault
              ? "bg-rose-600 text-white shadow-sm"
              : "bg-stone-100/90 text-stone-700 hover:bg-stone-200/90 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700")
          }
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
              className={
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition " +
                chipFocus +
                " " +
                (enabled
                  ? "text-white shadow-sm"
                  : "bg-stone-100/90 text-stone-500 hover:bg-stone-200/90 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700")
              }
              style={enabled ? { backgroundColor: meta.tint } : undefined}
            >
              <Icon className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
              <span>{meta.label}</span>
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          )
        })}

        <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-stone-300/80 dark:bg-stone-700" />

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
              className={
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition " +
                chipFocus +
                " " +
                (enabled
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "bg-stone-100/90 text-stone-500 hover:bg-stone-200/90 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700")
              }
            >
              <Icon className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
              <span className="capitalize">{cat}</span>
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          )
        })}

        {availableBusyness.length > 0 && (
          <>
            <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-stone-300/80 dark:bg-stone-700" />
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
                  className={
                    "flex shrink-0 items-center rounded-full px-2 py-1.5 text-[11px] font-medium transition " +
                    chipFocus +
                    " " +
                    (enabled
                      ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                      : "bg-stone-100/90 text-stone-500 hover:bg-stone-200/90 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700")
                  }
                >
                  <BusynessBadge
                    busyness={lvl}
                    size="sm"
                    className={enabled ? "!bg-transparent !text-inherit" : ""}
                  />
                  <span className="ml-1 tabular-nums opacity-70">{count}</span>
                </button>
              )
            })}
          </>
        )}
      </motion.nav>
    </div>
  )
}
