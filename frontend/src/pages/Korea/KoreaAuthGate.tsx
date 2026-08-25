import { sx } from '@/styles/merge'
import { koreaAuthGate } from './KoreaAuthGate.stylex'
import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Lock } from "lucide-react"
import { SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/clerk-react"
import { CLERK_ENABLED } from "@/lib/clerk"

const DEV_BEARER: string | null =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEV_BEARER) || null

interface KoreaAuthGateProps {
  children: ReactNode
}

// Wraps the Korea routes in a Clerk sign-in gate. Pass-through cases:
//   1. VITE_DEV_BEARER is set → bypass Clerk entirely for local automated
//      testing (the token comes from safeAuth.useGetToken instead).
//   2. CLERK_ENABLED is false → no Clerk in this build, no gate to apply.
// PR previews must NOT use VITE_DEV_BEARER. Agents apply a real session via
// `bun scripts/clerk-agent-login.ts` (Clerk Agent Tasks) instead.
// The actual Clerk components are still imported at module top so the
// call graph is statically analyzable; render is short-circuited before
// they're rendered.
export function KoreaAuthGate({ children }: KoreaAuthGateProps) {
  if (DEV_BEARER) return <>{children}</>
  if (!CLERK_ENABLED) return <>{children}</>
  return <ClerkKoreaGate>{children}</ClerkKoreaGate>
}

function ClerkKoreaGate({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth()
  if (!isLoaded) {
    return (
      <div
        {...sx(koreaAuthGate.scd317dd6)}
        role="status"
        aria-label="Checking sign-in"
      >
        <span {...sx(koreaAuthGate.sab7cc6fa)}>Loading…</span>
      </div>
    )
  }
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <SignInCard />
      </SignedOut>
    </>
  )
}

function SignInCard() {
  const reduce = useReducedMotion()
  return (
    <div {...sx(koreaAuthGate.sb45c37d4)}>
      <motion.div
        aria-hidden
        {...sx(koreaAuthGate.sa8b6f45d)}
        animate={reduce ? undefined : { x: [0, 30, 0], y: [0, 20, 0] }}
        transition={reduce ? { duration: 0 } : { duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        {...sx(koreaAuthGate.sb45cd97a)}
        animate={reduce ? undefined : { x: [0, -25, 0], y: [0, -15, 0] }}
        transition={reduce ? { duration: 0 } : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      <div {...sx(koreaAuthGate.sea3bae6c)}>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 24 }}
          {...sx(koreaAuthGate.s895ab3be)}
        >
          <motion.div
            initial={reduce ? false : { scale: 0.6, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 14, delay: 0.1 }}
            {...sx(koreaAuthGate.s56ac565b)}
            aria-hidden
          >
            🇰🇷
          </motion.div>
          <h1
            {...sx(koreaAuthGate.s45b8effa)}
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            South Korea
            <span {...sx(koreaAuthGate.sce3fe70)}>Seoul · Busan</span>
          </h1>
          <p {...sx(koreaAuthGate.sb359ba22)}>
            Sign in to view the full itinerary, reservations, and live travel status.
          </p>

          <SignInButton mode="modal">
            <button
              type="button"
              {...sx(koreaAuthGate.s69ac076f)}
            >
              <Lock {...sx(koreaAuthGate.scd3f3ccd)} aria-hidden />
              Sign in to continue
            </button>
          </SignInButton>

          <p {...sx(koreaAuthGate.s4ae2b500)}>
            Returning? Use the same account you used elsewhere on anthonyl.im.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
