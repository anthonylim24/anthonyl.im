import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useTabTitle } from "@/hooks/useTabTitle"
import { useAuthReady, useGetToken, useViewer } from "@/lib/safeAuth"
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authReady || !token) return
    let cancelled = false
    joinTrip(readToken, token, viewer.name ?? undefined).then(
      ({ trip }) => {
        if (!cancelled) navigate(`/trips/${trip.slug ?? trip.id}`, { replace: true })
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      cancelled = true
    }
    // The viewer's name only decorates the join; it must not re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, token, readToken, navigate])

  return (
    <div {...sx(s.gate)}>
      <div {...sx(s.gateInner)}>
        {error ? (
          <>
            <p {...sx(a.eyebrow)}>Invite link</p>
            <h1 {...sx(a.display, s.gateTitle)}>
              This link has <span {...sx(a.italic)}>expired.</span>
            </h1>
            <p {...sx(a.body)}>
              {/invite_not_found|404/i.test(error)
                ? "The trip’s owner turned it off or made a new one. Ask them to send a fresh link."
                : `We couldn’t add you to the trip. Check your connection and open the link again. (${error})`}
            </p>
            <Link to="/trips" {...sx(a.btn, a.btnPrimary)}>
              Go to your trips
            </Link>
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
