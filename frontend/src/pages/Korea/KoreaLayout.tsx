import { Suspense, useEffect } from "react"
import { Outlet } from "react-router-dom"
import { DayTreeNav } from "./DayTreeNav"
import { useKoreaSnapshot } from "./useKoreaData"
import { KoreaAuthGate } from "./KoreaAuthGate"
import { applyTheme, getInitialTheme } from "./koreaUtils"
import { startImageBudgetMonitor } from "./imageBudget"
import { EntityIndexProvider } from "./entityIndex"
import { KoreaChat } from "./KoreaChat"

export function KoreaLayout() {
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

  // No AnimatePresence/motion wrapper on <main> here. Previously this layout
  // ran a fade+slide via `<AnimatePresence mode="wait">` keyed on
  // `location.pathname`, which under motion@12 + react@19 occasionally
  // stalled the initial opacity-0 → 1 transition on cross-route SPA-nav
  // (notably /ingest → /places). The new page mounted at opacity 0 and
  // never animated back to 1 until a viewport resize kicked the motion
  // queue. The transition was nice-to-have; visibility is non-negotiable.
  return (
    <KoreaAuthGate>
      <EntityIndexProvider>
        <div className="korea min-h-screen bg-stone-50 text-stone-900 antialiased selection:bg-stone-900 selection:text-stone-50 dark:bg-stone-950 dark:text-stone-100 dark:selection:bg-stone-100 dark:selection:text-stone-900">
          {state.status === "success" && <DayTreeNav days={state.data.days} />}

          <main className="pb-20">
            {/* Local Suspense boundary keeps lazy Korea pages from bubbling up
                to the outer BreathworkShellFallback. React Router's startTransition
                means the old page stays visible during transitions; null fallback
                only shows for non-transition scenarios (e.g. direct URL landing). */}
            <Suspense fallback={null}>
              <Outlet context={state} />
            </Suspense>
          </main>

          {/* Trip concierge — floating CTA + chat panel, present on every Korea page. */}
          <KoreaChat />
        </div>
      </EntityIndexProvider>
    </KoreaAuthGate>
  )
}
