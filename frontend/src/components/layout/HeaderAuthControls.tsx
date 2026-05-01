import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'

export function HeaderAuthControls() {
  return (
    <div className="flex items-center">
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-lg px-4 py-2 text-sm font-semibold text-bw-secondary hover:text-bw hover:bg-bw-hover transition-all duration-300"
          >
            Sign In
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'h-11 w-11',
            },
          }}
        />
      </SignedIn>
    </div>
  )
}
