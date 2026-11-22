import { Suspense, useCallback, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { MessageCircle } from "lucide-react"
import { OverlayBoundary } from "@/components/OverlayBoundary"
import { lazyRetry } from "@/lib/lazyRetry"
import { sx } from "@/styles/merge"
import { useTripChatRoute } from "./tripChatRoute"
import { c } from "./chat.stylex"

// The concierge's button lives in the Trips layout chunk so it shows at
// once; the panel (transcript, cards, markdown) is its own chunk, fetched
// the first time the button is hovered, focused or pressed.

const TripChatPanel = lazyRetry(() => import("./TripChat").then((m) => ({ default: m.TripChatPanel })))

const FAB_SPRING = { type: "spring", stiffness: 400, damping: 28 } as const

export function TripChatLauncher() {
  const { tripId, dayId } = useTripChatRoute()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  /** The panel's code has been asked for. It stays mounted from then on. */
  const [wanted, setWanted] = useState(false)
  // The concierge is optional: if its code fails to load, the planner carries on without it.
  const [failed, setFailed] = useState(false)
  const fabRef = useRef<HTMLButtonElement>(null)
  const shown = open && Boolean(tripId)

  const want = useCallback(() => setWanted(true), [])
  const handleOpen = useCallback(() => {
    setWanted(true)
    setOpen(true)
  }, [])

  if (failed) return null

  return (
    <>
      {tripId ? (
        <motion.button
          ref={fabRef}
          type="button"
          onClick={handleOpen}
          onPointerEnter={want}
          onFocus={want}
          aria-label="Open trip concierge chat"
          aria-hidden={shown || undefined}
          tabIndex={shown ? -1 : undefined}
          initial={false}
          animate={shown ? { opacity: 0, scale: reduce ? 1 : 0.86 } : { opacity: 1, scale: 1 }}
          whileHover={reduce || shown ? undefined : { scale: 1.06 }}
          whileTap={reduce || shown ? undefined : { scale: 0.94 }}
          transition={reduce ? { duration: 0.15 } : FAB_SPRING}
          {...sx(c.fab, shown ? c.fabHidden : undefined, "trips-glass-pill")}
        >
          <MessageCircle {...sx(c.icon22)} strokeWidth={1.75} aria-hidden />
        </motion.button>
      ) : null}
      {wanted ? (
        <OverlayBoundary
          onError={() => {
            setFailed(true)
            setOpen(false)
          }}
        >
          <Suspense fallback={null}>
            <TripChatPanel tripId={tripId} dayId={dayId} open={shown} onOpenChange={setOpen} fabRef={fabRef} />
          </Suspense>
        </OverlayBoundary>
      ) : null}
    </>
  )
}
