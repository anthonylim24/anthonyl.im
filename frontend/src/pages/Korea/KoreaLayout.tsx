import { useEffect } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { DayTreeNav } from "./DayTreeNav"
import { useKoreaSnapshot } from "./useKoreaData"
import { KoreaAuthGate } from "./KoreaAuthGate"
import { applyTheme, getInitialTheme } from "./koreaUtils"
import { startImageBudgetMonitor } from "./imageBudget"

export function KoreaLayout() {
  const location = useLocation()
  const reduce = useReducedMotion()
  const state = useKoreaSnapshot()

  // Apply theme as early as possible so dark mode kicks in before paint.
  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  // Dev-only image budget watchdog. Warns in the console whenever any
  // <img> resource transfers more than 1 MB — a guard against future
  // regressions in `placePhoto` size caps. No-op in production builds.
  useEffect(() => {
    return startImageBudgetMonitor()
  }, [])

  return (
    <KoreaAuthGate>
      <div className="korea min-h-screen bg-stone-50 text-stone-900 antialiased selection:bg-stone-900 selection:text-stone-50 dark:bg-stone-950 dark:text-stone-100 dark:selection:bg-stone-100 dark:selection:text-stone-900">
        {state.status === "success" && <DayTreeNav days={state.data.days} />}

        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={location.pathname}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="pb-20"
          >
            <Outlet context={state} />
          </motion.main>
        </AnimatePresence>
      </div>
    </KoreaAuthGate>
  )
}
