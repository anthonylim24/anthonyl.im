import { useEffect } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { DayTreeNav } from "./DayTreeNav"
import { useKoreaSnapshot } from "./useKoreaData"
import { KoreaAuthGate } from "./KoreaAuthGate"
import { applyTheme, getInitialTheme } from "./koreaUtils"

export function KoreaLayout() {
  const location = useLocation()
  const reduce = useReducedMotion()
  const state = useKoreaSnapshot()

  // Apply theme as early as possible so dark mode kicks in before paint.
  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  return (
    <KoreaAuthGate>
      <div className="korea min-h-screen bg-stone-50 text-stone-900 antialiased selection:bg-rose-200 selection:text-rose-950 dark:bg-stone-950 dark:text-stone-100 dark:selection:bg-rose-900/60 dark:selection:text-rose-100">
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
