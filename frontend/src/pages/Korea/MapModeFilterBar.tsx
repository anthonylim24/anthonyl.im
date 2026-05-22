import { motion } from "motion/react"
import type { BusynessLevel, PlacePriority, RankedPlace } from "./mapModeTypes"
import { BusynessBadge } from "./BusynessBadge"

interface MapModeFilterBarProps {
  places: RankedPlace[]
  // The currently-enabled multi-select sets. Visibility is UNION:
  // a place shows if its category is in enabledCategories OR its
  // priority is in enabledPriorities. Selecting "Shopping" surfaces
  // ALL shopping places regardless of priority.
  enabledCategories: Set<string>
  enabledPriorities: Set<PlacePriority>
  enabledBusyness: Set<BusynessLevel>
  // Toggle: add the category if absent, remove if present.
  onSoloSelect: (cat: string) => void
  // Toggle: add the priority if absent, remove if present.
  onSoloPriority: (priority: PlacePriority) => void
  // Toggle busyness filter
  onSoloBusyness: (level: BusynessLevel) => void
  // Reset to defaults (priorities = {scheduled, core}, categories = {}).
  onReset: () => void
}

// Icon glyphs mirror the server's categoryIcon map
const CATEGORY_ICON: Record<string, string> = {
  hotel: "🏨",
  palace: "🏯",
  museum: "🏛️",
  shrine: "⛩️",
  market: "🛒",
  shopping: "🛍️",
  cafe: "☕",
  restaurant: "🍴",
  bar: "🍸",
  park: "🌳",
  viewpoint: "🗼",
  experience: "🎟️",
  transit: "🚄",
  neighborhood: "📍",
  venue: "💒",
  landmark: "📌",
}

const PRIORITY_META: { id: PlacePriority; label: string; icon: string; tint: string }[] = [
  // "Extra" is the user-facing name for the supplemental bucket.
  { id: "scheduled", label: "Scheduled", icon: "📅", tint: "#ff4d6d" },
  { id: "core", label: "Core", icon: "✦", tint: "#fb923c" },
  { id: "supplemental", label: "Extra", icon: "✶", tint: "#a3a3a3" },
]

const BUSYNESS_ORDER: BusynessLevel[] = ['quiet', 'moderate', 'busy', 'very_busy']

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

  // "Default" reset state = no extra categories, priorities = {scheduled, core}, no busyness.
  // The "All" chip lights up when we're at this default so the user knows
  // resetCategories() is a no-op at the moment.
  const atDefault =
    enabledCategories.size === 0 &&
    enabledPriorities.size === 2 &&
    enabledPriorities.has('scheduled') &&
    enabledPriorities.has('core') &&
    enabledBusyness.size === 0

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)" }}
    >
      <motion.nav
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 28, delay: 0.08 }}
        aria-label="Filter places"
        className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full bg-white/85 px-2 py-1.5 shadow-lg ring-1 ring-stone-200 backdrop-blur-md sm:max-w-3xl dark:bg-stone-900/85 dark:ring-stone-800 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          // Faint edge mask hints at horizontal scrollability when chips overflow.
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
          aria-label={`Show all ${places.length} places`}
          className={
            "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 " +
            (atDefault
              ? "bg-rose-600 text-white shadow-sm"
              : "bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700")
          }
        >
          All · {places.length}
        </button>

        {/* Priority chips: keep them grouped on the left so users find them
            consistently across days. The thin divider visually separates
            the two filter families. */}
        {PRIORITY_META.map((meta) => {
          const count = priorityCounts.get(meta.id) ?? 0
          if (count === 0) return null
          const enabled = enabledPriorities.has(meta.id)
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => onSoloPriority(meta.id)}
              aria-pressed={enabled}
              title={`${meta.label} · ${count}`}
              className={
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 " +
                (enabled
                  ? "text-white shadow-sm"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700")
              }
              style={enabled ? { backgroundColor: meta.tint } : undefined}
            >
              <span aria-hidden className="text-[10px] leading-none">
                {meta.icon}
              </span>
              <span>{meta.label}</span>
              <span className="opacity-70">{count}</span>
            </button>
          )
        })}

        <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-stone-300 dark:bg-stone-700" />

        {cats.map(([cat, count]) => {
          const enabled = enabledCategories.has(cat)
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSoloSelect(cat)}
              aria-pressed={enabled}
              title={`${cat} · ${count}`}
              className={
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 " +
                (enabled
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700")
              }
            >
              <span aria-hidden>{CATEGORY_ICON[cat] ?? "•"}</span>
              <span className="capitalize">{cat}</span>
              <span className="opacity-70">{count}</span>
            </button>
          )
        })}

        {availableBusyness.length > 0 && (
          <>
            <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-stone-300 dark:bg-stone-700" />
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
                    "flex shrink-0 items-center rounded-full px-2 py-1 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 " +
                    (enabled
                      ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700")
                  }
                >
                  <BusynessBadge busyness={lvl} size="sm" className={enabled ? "!bg-transparent !text-inherit" : ""} />
                  <span className="ml-1 opacity-70">{count}</span>
                </button>
              )
            })}
          </>
        )}
      </motion.nav>
    </div>
  )
}
