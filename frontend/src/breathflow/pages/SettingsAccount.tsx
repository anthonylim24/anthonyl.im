import { SignedIn, SignedOut, SignInButton, SignOutButton, useUser } from '@clerk/clerk-react'
import { btnSecondary } from '../components/buttonStyles'

function AccountRow() {
  const { user } = useUser()
  if (!user) return null

  return (
    <div className="flex items-center gap-3">
      <img
        src={user.imageUrl}
        alt=""
        loading="lazy"
        className="h-10 w-10 rounded-full ring-1 ring-bw-border"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-bw">{user.fullName}</p>
        <p className="truncate text-xs text-bw-secondary">
          {user.primaryEmailAddress?.emailAddress} · synced
        </p>
      </div>
      <SignOutButton>
        <button type="button" className={btnSecondary}>Sign out</button>
      </SignOutButton>
    </div>
  )
}

/** Optional cloud sync: local-first stays the default. Mood stays local. */
export function SettingsAccount() {
  return (
    <>
      <SignedOut>
        <p className="text-xs leading-relaxed text-bw-secondary">
          Sign in with Google to sync across devices.
        </p>
        <SignInButton mode="modal">
          <button type="button" className={`${btnSecondary} mt-3`}>Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <AccountRow />
      </SignedIn>
    </>
  )
}
