import { SignedIn, SignedOut, SignInButton, SignOutButton, useUser } from '@clerk/clerk-react'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
import { btn } from '../components/buttonStyles.stylex'

function AccountRow() {
  const { user } = useUser()
  if (!user) return null

  return (
    <div {...sx(bf.flexItemsCenterGap3)}>
      <img
        src={user.imageUrl}
        alt=""
        loading="lazy"
        {...sx(bf.h10, bf.w10, bf.roundedFull, bf.ring1BwBorder)}
      />
      <div {...sx(bf.minW0, bf.flex1)}>
        <p {...sx(bf.truncate, bf.textSm, bf.fontMedium, bf.textBw)}>{user.fullName}</p>
        <p {...sx(bf.truncate, bf.textXs, bf.textSecondary)}>
          {user.primaryEmailAddress?.emailAddress} · synced
        </p>
      </div>
      <SignOutButton>
        <button type="button" {...sx(btn.base, btn.secondary)}>Sign out</button>
      </SignOutButton>
    </div>
  )
}

/** Optional cloud sync: local-first stays the default. Mood stays local. */
export function SettingsAccount() {
  return (
    <>
      <SignedOut>
        <p {...sx(bf.textXs, bf.leadingRelaxed, bf.textSecondary)}>
          Sign in with Google to sync across devices.
        </p>
        <SignInButton mode="modal">
          <button type="button" {...sx(btn.base, btn.secondary, btn.mt3)}>Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <AccountRow />
      </SignedIn>
    </>
  )
}
