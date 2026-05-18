import { motion } from "motion/react"
import type { PlacePriority, RankedPlace } from "./mapModeTypes"

interface MapModeFilterBarProps {
  places: RankedPlace[]
  enabledCategories: Set<string>
  enabledPriorities: Set<PlacePriority>
  // Solo-select a category: clicking a chip should enable ONLY that
  // category and disable the rest. Clicking the already-solo'd chip
  // reverts to all-enabled. Parent decides how to map this to its
  // disabledCategories state.
  onSoloSelect: (cat: string) => void
  // Same solo-select behavior, but for the three priority buckets.
  onSoloPriority: (priority: PlacePriority) => void
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
}

const PRIORITY_META: { id: PlacePriority; label: string; icon: string; tint: string }[] = [
  // "Extra" is the user-facing name for the supplemental bucket.
  { id: "scheduled", label: "Scheduled", icon: "📅", tint: "#ff4d6d" },
  { id: "core", label: "Core", icon: "✦", tint: "#fb923c" },
  { id: "supplemental", label: "Extra", icon: "✶", tint: "#a3a3a3" },
]

export function MapModeFilterBar({
  places,
  enabledCategories,
  enabledPriorities,
  onSoloSelect,
  onSoloPriority,
  onReset,
}: MapModeFilterBarProps) {
  const counts = new Map<string, number>()
  for (const p of places) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  const cats = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])

  const priorityCounts = new Map<PlacePriority, number>()
  for (const p of places) priorityCounts.set(p.priority, (priorityCounts.get(p.priority) ?? 0) + 1)

  const allCategoriesEnabled = enabledCategories.size === 0 || enabledCategories.size === cats.length
  const allPrioritiesEnabled = enabledPriorities.size === 0 || enabledPriorities.size === 3
  const allEnabled = allCategoriesEnabled && allPrioritiesEnabled

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[60px] z-20 flex justify-center px-3 pt-3">
      <motion.nav
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 28, delay: 0.3 }}
        aria-label="Filter places"
        className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full bg-white/85 px-2 py-1.5 shadow-lg ring-1 ring-stone-200 backdrop-blur-md sm:max-w-3xl dark:bg-stone-900/85 dark:ring-stone-800 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          onClick={onReset}
          aria-pressed={allEnabled}
          className={
            "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition " +
            (allEnabled
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
          const enabled = enabledPriorities.size === 0 || enabledPriorities.has(meta.id)
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => onSoloPriority(meta.id)}
              aria-pressed={enabled}
              title={`${meta.label} · ${count}`}
              className={
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition " +
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
          const enabled = enabledCategories.size === 0 || enabledCategories.has(cat)
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSoloSelect(cat)}
              aria-pressed={enabled}
              title={`${cat} · ${count}`}
              className={
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition " +
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
      </motion.nav>
    </div>
  )
}
