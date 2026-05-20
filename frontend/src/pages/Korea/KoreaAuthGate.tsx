import type { ReactNode } from "react"
import { motion } from "motion/react"
import { Lock } from "lucide-react"
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react"
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
// The actual Clerk components are still imported at module top so the
// call graph is statically analyzable; render is short-circuited before
// they're rendered.
export function KoreaAuthGate({ children }: KoreaAuthGateProps) {
  if (DEV_BEARER) return <>{children}</>
  if (!CLERK_ENABLED) return <>{children}</>

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
  return (
    <div className="korea relative min-h-screen overflow-hidden bg-gradient-to-b from-stone-50 via-rose-50/40 to-amber-50/30 text-stone-900 dark:from-stone-950 dark:via-rose-950/20 dark:to-stone-950 dark:text-stone-100">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-rose-300/30 blur-3xl dark:bg-rose-900/20"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-900/15"
        animate={{ x: [0, -25, 0], y: [0, -15, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 24 }}
          className="w-full rounded-3xl border border-stone-200/70 bg-white/80 p-7 shadow-xl backdrop-blur-xl sm:p-8 dark:border-stone-800/70 dark:bg-stone-900/70"
        >
          <motion.div
            initial={{ scale: 0.6, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 14, delay: 0.1 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-3xl shadow-inner dark:bg-rose-950/60"
            aria-hidden
          >
            🇰🇷
          </motion.div>
          <h1
            className="mt-5 text-center font-serif text-2xl text-stone-900 sm:text-3xl dark:text-stone-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            South Korea
            <span className="block text-stone-500 dark:text-stone-400">Seoul · Busan</span>
          </h1>
          <p className="mt-3 text-center text-sm text-stone-600 dark:text-stone-400">
            Sign in to view the full itinerary, reservations, and live travel status.
          </p>

          <SignInButton mode="modal">
            <button
              type="button"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
            >
              <Lock className="h-4 w-4" aria-hidden />
              Sign in to continue
            </button>
          </SignInButton>

          <p className="mt-5 text-center text-[11px] text-stone-500 dark:text-stone-500">
            Returning? Use the same account you used elsewhere on anthonyl.im.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
