import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/clerk-react'
import { Cloud } from 'lucide-react'
import { motion } from 'motion/react'
import type { ComponentProps } from 'react'

type MotionSectionVariants = ComponentProps<typeof motion.section>['variants']

function AccountInfo() {
  const { user } = useUser()
  if (!user) return null

  return (
    <div className="flex items-center gap-4">
      <img
        src={user.imageUrl}
        alt={user.fullName ?? 'Profile'}
        loading="lazy"
        className="h-10 w-10 ring-1 ring-bw-border"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-bw truncate">
          {user.fullName}
        </p>
        <p className="text-[10px] text-bw-tertiary truncate">
          {user.primaryEmailAddress?.emailAddress}
        </p>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 border border-bw-border">
        <div className="h-1 w-1 animate-pulse bg-bw-tertiary" />
        <span className="text-[10px] font-medium text-bw-secondary">Synced</span>
      </div>
    </div>
  )
}

interface SettingsAccountSectionProps {
  variants: MotionSectionVariants
}

export function SettingsAccountSection({ variants }: SettingsAccountSectionProps) {
  return (
    <motion.section variants={variants} className="border-t border-bw-border pt-5 pb-6">
      <h2 className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary mb-4">Account</h2>
      <SignedOut>
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-xs text-bw-tertiary">
            Sign in with Google to sync your progress across devices
          </p>
          <SignInButton mode="modal">
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all duration-300 border border-bw-border hover:bg-bw-hover text-bw"
            >
              <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
              Sign in to sync
            </button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <AccountInfo />
      </SignedIn>
    </motion.section>
  )
}
