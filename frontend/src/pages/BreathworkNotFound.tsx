import { Link } from 'react-router-dom'
import { ArrowRight, Home, Wind } from 'lucide-react'
import { motion } from 'motion/react'
import { useEntranceMotion } from '@/lib/motionPresets'

export function BreathworkNotFound() {
  const { stagger, fadeUp, transition: motionTransition, tap } = useEntranceMotion()

  return (
    <motion.div
      className="flex min-h-[calc(100svh-12rem)] flex-col justify-center py-10"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeUp} className="border-y border-bw-border py-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
          Page not found
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-none text-bw md:text-5xl">
          Return to the breath
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-bw-tertiary">
          This BreathFlow route does not exist. Start again from the protocol lab or open a session directly.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <motion.div whileTap={tap(0.99)} transition={motionTransition}>
            <Link
              to="/breathwork"
              className="group flex min-h-11 items-center justify-between gap-3 border border-bw-accent bg-bw-accent px-4 py-3 text-sm font-medium text-bw-accent-foreground transition-opacity hover:opacity-90"
            >
              <span className="flex items-center gap-2">
                <Home className="h-4 w-4" aria-hidden="true" />
                Open protocol lab
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </motion.div>

          <motion.div whileTap={tap(0.99)} transition={motionTransition}>
            <Link
              to="/breathwork/session"
              className="group flex min-h-11 items-center justify-between gap-3 border border-bw-border px-4 py-3 text-sm font-medium text-bw transition-colors hover:bg-bw-hover"
            >
              <span className="flex items-center gap-2">
                <Wind className="h-4 w-4 text-bw-accent" aria-hidden="true" />
                Start a session
              </span>
              <ArrowRight className="h-4 w-4 text-bw-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-bw" aria-hidden="true" />
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  )
}
