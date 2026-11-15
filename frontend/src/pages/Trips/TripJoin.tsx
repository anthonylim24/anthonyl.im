import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { RotateCw } from "lucide-react"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useTabTitle } from "@/hooks/useTabTitle"
import { useAuthReady, useGetToken, useViewer } from "@/lib/safeAuth"
import { joinFailure, type JoinFailure } from "./joinFailure"
import { joinTrip } from "./tripsApi"
import { a } from "./atlas.stylex"
import { shell as s } from "./index.stylex"
import { Spinner } from "./components/kit"

/** `/trips/join/:token` — accept an invite link, then open the trip. */
export function TripJoin() {
  useTabTitle("Joining trip · Trips")
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const authReady = useAuthReady()
  const viewer = useViewer()
  const [failure, setFailure] = useState<JoinFailure | null>(null)
  /** Bumped by Try again to run the join once more. */
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!authReady || !token) return
    let cancelled = false
    joinTrip(readToken, token, viewer.name ?? undefined).then(
      ({ trip }) => {
        if (!cancelled) navigate(`/trips/${trip.slug ?? trip.id}`, { replace: true })
      },
      (err: unknown) => {
        if (!cancelled) setFailure(joinFailure(err))
      },
    )
    return () => {
      cancelled = true
    }
    // The viewer's name only decorates the join; it must not re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, token, readToken, navigate, attempt])

  return (
    <div {...sx(s.gate)}>
      <div {...sx(s.gateInner)}>
        {failure?.kind === "dead" ? (
          <>
            <p {...sx(a.eyebrow)}>Invite link</p>
            <h1 {...sx(a.display, s.gateTitle)}>
              This link has <span {...sx(a.italic)}>expired.</span>
            </h1>
            <p {...sx(a.body)}>The trip’s owner turned it off or made a new one. Ask them to send a fresh link.</p>
            <Link to="/trips" {...sx(a.btn, a.btnPrimary)}>
              Go to your trips
            </Link>
          </>
        ) : failure?.kind === "retry" ? (
          <>
            <p {...sx(a.eyebrow)}>Invite link</p>
            <h1 {...sx(a.display, s.gateTitle)}>
              Couldn’t <span {...sx(a.italic)}>join</span> just now.
            </h1>
            <p {...sx(a.body)}>
              The link may be fine; the request didn’t get through. Check your connection and try again. ({failure.detail})
            </p>
            <div {...sx(a.rowWrap)}>
              <button type="button" {...sx(a.btn, a.btnPrimary)} onClick={() => {
                  setFailure(null)
                  setAttempt((n) => n + 1)
                }}
              >
                <RotateCw size={16} strokeWidth={1.75} aria-hidden />
                Try again
              </button>
              <Link to="/trips" {...sx(a.btn, a.btnGhost)}>
                Go to your trips
              </Link>
            </div>
          </>
        ) : (
          <p {...sx(a.row, a.body)} role="status">
            <Spinner /> Adding you to the trip…
          </p>
        )}
      </div>
    </div>
  )
}
