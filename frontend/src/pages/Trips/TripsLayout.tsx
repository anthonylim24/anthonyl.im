import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { ArrowLeft, Lock, Plus, RotateCw } from "lucide-react"
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth, useClerk } from "@clerk/clerk-react"
import { sx } from "@/styles/merge"
import { CLERK_ENABLED } from "@/lib/clerk"
import { useAuthStall, type StallCause } from "@/lib/authStall"
import { ThemeToggle } from "../Korea/ThemeToggle"
import { applyTheme, getInitialTheme } from "../Korea/koreaUtils"
import { a } from "./atlas.stylex"
import { shell as s } from "./index.stylex"
import { Engraving } from "./components/kit"
import compass from "./art/compass.webp"
import { TripChatLauncher } from "./TripChatLauncher"
import { CommandProvider } from "./command/CommandContext"
import { CommandButton } from "./command/CommandButton"
import { deviceStore, noStore, type DeviceStore } from "./offline/deviceStore"
import { claimDevice, cookieSession, deviceOwner, forgetDevice } from "./offline/tripCopies"
import { TripsDeviceContext, type CopyShown } from "./offline/tripsDevice"
import { copyBannerText, leftUnsavedText } from "./offline/bannerText"
import { OfflineBanner } from "./offline/OfflineBanner"
import { useOnline } from "./offline/network"

const DEV_BEARER: string | null =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEV_BEARER) || null

/** Who the pages are for, as far as this device's kept trips go, and whether they show those copies instead of live ones. */
interface DeviceAccess {
  owner: string
  mode: "live" | "copy"
}

type GateChildren = (access: DeviceAccess) => ReactNode

function TripsAuthGate({ store, children }: { store: DeviceStore; children: GateChildren }) {
  if (DEV_BEARER || !CLERK_ENABLED) return <LocalGate store={store}>{children}</LocalGate>
  return <ClerkTripsGate store={store}>{children}</ClerkTripsGate>
}

/** `who` may keep trips on this device: true once any other account's are forgotten. */
function useClaim(store: DeviceStore, who: string | null): boolean {
  const [claimed, setClaimed] = useState<string | null>(null)
  useEffect(() => {
    if (!who) return
    let live = true
    void claimDevice(store, who).then(() => {
      if (live) setClaimed(who)
    })
    return () => {
      live = false
    }
  }, [store, who])
  return who !== null && claimed === who
}

/** The account this device keeps trips for (undefined while reading it). */
function useKeptOwner(store: DeviceStore): string | null | undefined {
  const [kept, setKept] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void deviceOwner(store).then((owner) => {
      if (live) setKept(owner)
    })
    return () => {
      live = false
    }
  }, [store])
  return kept
}

function Checking() {
  return (
    <div {...sx(s.gate)} role="status" aria-label="Checking sign-in">
      <span {...sx(a.eyebrow)}>Loading…</span>
    </div>
  )
}

/** Dev bearer, or no sign-in at all: one local traveller. */
function LocalGate({ store, children }: { store: DeviceStore; children: GateChildren }) {
  const ready = useClaim(store, "local")
  return ready ? <>{children({ owner: "local", mode: "live" })}</> : <Checking />
}

const stallCopy: Record<StallCause, { title: string; body: string }> = {
  offline: {
    title: "You are offline",
    body: "Trips needs a connection to sign you in. It will carry on by itself once you are back online.",
  },
  site: {
    title: "anthonyl.im is not answering",
    body: "The connection to this site dropped. This page keeps trying and will carry on by itself.",
  },
  auth: {
    title: "Sign-in is not loading",
    body: "Your network may be blocking the sign-in service. This page keeps trying and will carry on by itself; another network or turning off Wi-Fi filtering usually gets through.",
  },
}

/** Clerk's own account of its load: "loading", "ready", "degraded" (loaded, but its servers aren't answering) or "error". */
function useClerkStatus(): string {
  const clerk = useClerk()
  const [status, setStatus] = useState<string>(clerk.status)
  useEffect(() => {
    const onStatus = (next: string) => setStatus(next)
    clerk.on("status", onStatus, { notify: true })
    return () => clerk.off("status", onStatus)
  }, [clerk])
  return status
}

function ClerkTripsGate({ store, children }: { store: DeviceStore; children: GateChildren }) {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const status = useClerkStatus()
  const { stalled, cause } = useAuthStall(isLoaded, status === "error")
  const online = useOnline()
  const kept = useKeptOwner(store)
  const signedInAs = isLoaded && isSignedIn ? (userId ?? null) : null
  const claimed = useClaim(store, signedInAs)

  // Signed out for certain (Clerk answered, and there is a connection): forget every kept trip.
  const signedOut = isLoaded && !isSignedIn && online && status === "ready"
  useEffect(() => {
    if (signedOut) void forgetDevice(store)
  }, [signedOut, store])

  if (signedInAs) return claimed ? <>{children({ owner: signedInAs, mode: "live" })}</> : <Checking />

  // Sign-in can't answer (no connection, blocked, or down). Show the copies
  // kept here only while Clerk's own cookies still name their owner, so a
  // sign-out or another account anywhere on the site hides them.
  const unreachable = isLoaded ? !online || status === "degraded" : !online || stalled
  if (unreachable && kept && cookieSession() === kept) return <>{children({ owner: kept, mode: "copy" })}</>

  if (!isLoaded) {
    if (stalled && cause) {
      const copy = stallCopy[cause]
      return (
        <div {...sx(s.gate)} role="status" aria-live="polite">
          <div {...sx(s.gateInner)}>
            <CompassMark size={40} />
            <h1 {...sx(a.display, s.gateTitle)}>{copy.title}</h1>
            <p {...sx(a.body)}>{copy.body}</p>
            <button type="button" {...sx(a.btn, a.btnPrimary)} onClick={() => window.location.reload()}>
              <RotateCw size={16} strokeWidth={1.75} aria-hidden />
              Try again
            </button>
          </div>
        </div>
      )
    }
    return <Checking />
  }
  return (
    <>
      <SignedIn>
        <Checking />
      </SignedIn>
      <SignedOut>
        <div {...sx(s.gate)}>
          <div {...sx(s.gateInner)}>
            <Engraving src={compass} />
            <h1 {...sx(a.display, s.gateTitle)}>
              Sign in to <span {...sx(a.italic)}>Trips</span>
            </h1>
            <p {...sx(a.body)}>Your itineraries, maps and bookings stay private to you and the people you invite.</p>
            <SignInButton mode="modal">
              <button type="button" {...sx(a.btn, a.btnPrimary)}>
                <Lock size={16} strokeWidth={1.75} aria-hidden />
                Sign in to continue
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
    </>
  )
}

/** Pages that can show a kept copy: the index and a trip. Creating or joining needs the server. */
const READABLE_OFFLINE = /^\/trips(?:\/(?!new\/?$|join(?:\/|$))[^/]+(?:\/day\/[^/]+)?)?\/?$/

function NeedsConnection() {
  return (
    <div {...sx(s.gate)}>
      <div {...sx(s.gateInner)}>
        <CompassMark size={40} />
        <h1 {...sx(a.display, s.gateTitle)}>This needs a connection</h1>
        <p {...sx(a.body)}>Sign-in can’t be reached right now. The trips saved on this device can still be read.</p>
        <Link to="/trips" {...sx(a.btn, a.btnPrimary)}>
          See your trips
        </Link>
      </div>
    </div>
  )
}

/** Eight-point compass rose: the Trips mark. */
export function CompassMark({ size = 22, style }: { size?: number; style?: Parameters<typeof sx>[0] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...sx(style)}>
      <path d="M12 1.5 14 10l8.5 2-8.5 2-2 8.5-2-8.5L1.5 12 10 10Z" fill="currentColor" />
      <path d="m5.6 5.6 4 3.2-.8.8ZM18.4 5.6l-3.2 4-.8-.8ZM18.4 18.4l-4-3.2.8-.8ZM5.6 18.4l3.2-4 .8.8Z" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

/** Lets the header (outside the sign-in gate) drop what can't work on kept copies. */
function ReportMode({ mode, onMode }: { mode: "live" | "copy"; onMode: (copy: boolean) => void }) {
  useEffect(() => {
    onMode(mode === "copy")
    return () => onMode(false)
  }, [mode, onMode])
  return null
}

export function TripsLayout() {
  const { pathname } = useLocation()
  const atIndex = /^\/trips\/?$/.test(pathname)
  const creating = /^\/trips\/new\/?$/.test(pathname)
  const [store] = useState(deviceStore)
  const online = useOnline()
  const [shown, setShown] = useState<CopyShown | null>(null)
  const [left, setLeft] = useState<{ name: string; reason: string } | null>(null)
  const [copyMode, setCopyMode] = useState(false)
  const showCopy = useCallback((next: CopyShown | null) => setShown(next), [])
  const leftUnsaved = useCallback((name: string, reason: string) => setLeft({ name, reason }), [])
  const dismissLeft = useCallback(() => setLeft(null), [])
  const retry = useCallback(() => window.location.reload(), [])

  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  useEffect(() => {
    document.documentElement.dataset.tripsScroll = ""
    return () => {
      delete document.documentElement.dataset.tripsScroll
    }
  }, [])

  return (
    <CommandProvider>
    <div {...sx("trips", s.root)}>
      <a href="#trips-main" {...sx(s.skip)}>
        Skip to content
      </a>
      <header {...sx(s.header)}>
        <div {...sx(s.headerSide)}>
          {!atIndex && (
            <Link to="/trips" {...sx(a.iconBtn)} aria-label="Back to all trips">
              <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
            </Link>
          )}
          <Link to="/trips" {...sx("group", s.brand)} aria-label="Trips home">
            <CompassMark style={s.brandMark} />
            Trips
          </Link>
        </div>
        <div {...sx(s.headerSide)}>
          {!creating && !copyMode && (
            <Link to="/trips/new" {...sx(a.btn, a.btnGhost, a.btnSm)} aria-label="New trip">
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              <span {...sx(s.newLabel)}>New trip</span>
            </Link>
          )}
          <CommandButton />
          <span {...sx("trip-tap-44")}>
            <ThemeToggle style={s.themeToggle} />
          </span>
          {CLERK_ENABLED && !DEV_BEARER && !copyMode ? <UserButton afterSignOutUrl="/" /> : null}
        </div>
      </header>
      <TripsAuthGate store={store}>
        {({ owner, mode }) => (
          <TripsDeviceContext.Provider value={{ store, owner: store === noStore ? null : owner, mode, showCopy, leftUnsaved }}>
            <ReportMode mode={mode} onMode={setCopyMode} />
            <OfflineBanner
              copy={copyBannerText({ shown, mode, online })}
              left={left && leftUnsavedText(left.name, left.reason, store !== noStore)}
              onRetry={retry}
              onDismissLeft={dismissLeft}
            />
            <main id="trips-main" tabIndex={-1} {...sx(s.main)}>
              {mode === "copy" && !READABLE_OFFLINE.test(pathname) ? <NeedsConnection /> : <Outlet />}
            </main>
            {mode === "live" && <TripChatLauncher />}
          </TripsDeviceContext.Provider>
        )}
      </TripsAuthGate>
    </div>
    </CommandProvider>
  )
}
