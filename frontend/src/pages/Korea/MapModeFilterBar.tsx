import { motion } from "motion/react"
import type { RankedPlace } from "./mapModeTypes"

interface MapModeFilterBarProps {
  places: RankedPlace[]
  enabledCategories: Set<string>
  onToggle: (cat: string) => void
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

export function MapModeFilterBar({ places, enabledCategories, onToggle, onReset }: MapModeFilterBarProps) {
  const counts = new Map<string, number>()
  for (const p of places) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  const cats = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])

  const allEnabled = enabledCategories.size === 0 || enabledCategories.size === cats.length

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-3">
      <motion.nav
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 28, delay: 0.3 }}
        aria-label="Filter places by category"
        className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-full bg-white/85 px-2 py-1.5 shadow-lg ring-1 ring-stone-200 backdrop-blur-md sm:max-w-3xl dark:bg-stone-900/85 dark:ring-stone-800 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
        {cats.map(([cat, count]) => {
          const enabled = enabledCategories.size === 0 || enabledCategories.has(cat)
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onToggle(cat)}
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
