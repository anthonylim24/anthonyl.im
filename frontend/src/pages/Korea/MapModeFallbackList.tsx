import { motion, useReducedMotion } from "motion/react"
import type { RankedPlace } from "./mapModeTypes"

interface MapModeFallbackListProps {
  places: RankedPlace[]
  onSelect: (place: RankedPlace) => void
}

const priorityLabel: Record<RankedPlace["priority"], string> = {
  scheduled: "Scheduled",
  core: "Core",
  supplemental: "Nearby",
}

const priorityRingColor: Record<RankedPlace["priority"], string> = {
  scheduled: "ring-rose-400 dark:ring-rose-500",
  core: "ring-amber-400 dark:ring-amber-500",
  supplemental: "ring-stone-300 dark:ring-stone-700",
}

// Rendered when WebGL is unavailable (browsers blocking GPU, locked-down corp
// devices, some headless contexts). Shows the same place data as a tappable
// list grouped by priority — no 3D, but full functionality.
export function MapModeFallbackList({ places, onSelect }: MapModeFallbackListProps) {
  const reduce = useReducedMotion()

  const groups: Record<RankedPlace["priority"], RankedPlace[]> = {
    scheduled: [],
    core: [],
    supplemental: [],
  }
  for (const p of places) groups[p.priority].push(p)

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-4 sm:px-6">
      <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        3D view unavailable in this browser — showing a list. The same places, same priorities.
      </div>

      {(Object.keys(groups) as RankedPlace["priority"][]).map((priority) =>
        groups[priority].length > 0 ? (
          <section key={priority} className="mb-5">
            <h3 className="mb-2 text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400">
              {priorityLabel[priority]} · {groups[priority].length}
            </h3>
            <ul className="space-y-2">
              {groups[priority].map((p, i) => (
                <motion.li
                  key={p.id}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : i * 0.03 }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className={
                      "group flex w-full items-start gap-3 rounded-2xl border border-stone-200 bg-white/80 p-3.5 text-left shadow-sm transition hover:border-rose-300 hover:bg-rose-50 dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-rose-700 dark:hover:bg-rose-950/30"
                    }
                  >
                    <span
                      aria-hidden
                      className={
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-inner ring-2 " +
                        priorityRingColor[priority]
                      }
                      style={{ background: p.color + "22" }}
                    >
                      {p.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{p.name}</p>
                      <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                        {p.category} · {p.distanceLabel ?? p.city}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-stone-600 dark:text-stone-400">{p.reason}</p>
                    </div>
                    <span aria-hidden className="self-center text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-rose-500">
                      →
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  )
}
