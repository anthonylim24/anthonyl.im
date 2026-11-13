import { useEffect, useState } from "react"
import { Check, Copy, Globe2, Link2, LogOut, UserRound, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { routerBasename } from "@/lib/routerBasename"
import { createInvite, getTrip, leaveTrip, revokeInvite, updateTrip, type GetToken } from "../tripsApi"
import { resolveAccent } from "../meta"
import type { CollaboratorRole, Trip, TripAccess } from "../types"
import { a } from "../atlas.stylex"
import { share as s } from "../workspace.stylex"
import { Modal, Spinner } from "./kit"

// Sharing is link-first: pick a role, copy a link, send it. Whoever opens
// it while signed in joins the trip with that role. The owner can change a
// person's role, remove them, or reset a link.

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; trip: Trip; access: TripAccess }

const ROLE_COPY: Record<CollaboratorRole, { label: string; hint: string }> = {
  viewer: { label: "Can view", hint: "Sees the itinerary and map. Can’t change anything." },
  editor: { label: "Can edit", hint: "Can add, move and remove stops, and use AI." },
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}${routerBasename() ?? ""}/trips/join/${token}`
}

export function ShareDialog({
  tripId,
  open,
  onClose,
  getToken,
  viewerId,
  onChanged,
  onLeft,
}: {
  tripId: string
  open: boolean
  onClose: () => void
  getToken: GetToken
  viewerId: string | null
  /** Called with the saved trip after collaborators change. */
  onChanged?: (trip: Trip) => void
  /** Called after the viewer leaves the trip. */
  onLeft?: () => void
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" })
  const [role, setRole] = useState<CollaboratorRole>("viewer")
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoad({ status: "loading" })
    setError(null)
    setCopied(false)
    getTrip(getToken, tripId).then(
      ({ trip, access }) => !cancelled && setLoad({ status: "ready", trip, access }),
      (err: unknown) => !cancelled && setLoad({ status: "error", message: err instanceof Error ? err.message : String(err) }),
    )
    return () => {
      cancelled = true
    }
  }, [open, tripId, getToken])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2200)
    return () => clearTimeout(timer)
  }, [copied])

  const trip = load.status === "ready" ? load.trip : null
  const owner = load.status === "ready" && load.access === "owner"
  const invite = trip?.invites?.find((i) => i.role === role)

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const setTrip = (next: Trip) => {
    setLoad((current) => (current.status === "ready" ? { ...current, trip: next } : current))
  }

  const copyLink = () =>
    run("copy", async () => {
      if (!trip) return
      const active = invite ?? (await createInvite(getToken, trip.id, role))
      if (!invite) setTrip({ ...trip, invites: [...(trip.invites ?? []), active] })
      await navigator.clipboard.writeText(inviteUrl(active.token))
      setCopied(true)
    })

  const resetLink = () =>
    run("reset", async () => {
      if (!trip || !invite) return
      await revokeInvite(getToken, trip.id, invite.token)
      setTrip({ ...trip, invites: (trip.invites ?? []).filter((i) => i.token !== invite.token) })
    })

  const saveCollaborators = (key: string, collaborators: Trip["collaborators"]) =>
    run(key, async () => {
      if (!trip) return
      const saved = await updateTrip(getToken, trip.id, { collaborators })
      const next = { ...saved, invites: trip.invites }
      setTrip(next)
      onChanged?.(next)
    })

  const leave = () =>
    run("leave", async () => {
      if (!trip) return
      await leaveTrip(getToken, trip.id)
      onLeft?.()
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share this trip"
      description={trip ? `Invite people to ${trip.name}.` : undefined}
      accent={trip ? resolveAccent(trip.appearance?.accent) : undefined}
    >
      {load.status === "loading" && (
        <div {...sx(a.row, a.muted)} role="status">
          <Spinner /> Loading sharing…
        </div>
      )}
      {load.status === "error" && (
        <p {...sx(a.alert)} role="alert">
          Couldn’t load sharing for this trip. ({load.message})
        </p>
      )}
      {trip && (
        <>
          {trip.sharedWithAllUsers && (
            <p {...sx(a.notice)}>
              <Globe2 size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink)} />
              Everyone with an account can already see and edit this trip.
            </p>
          )}

          {owner && (
            <section {...sx(a.stack)} aria-label="Invite link">
              <div {...sx(s.segment)} role="radiogroup" aria-label="What the link allows">
                {(Object.keys(ROLE_COPY) as CollaboratorRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    {...sx(s.segmentBtn, role === r && s.segmentOn)}
                    onClick={() => {
                      setRole(r)
                      setCopied(false)
                    }}
                  >
                    {ROLE_COPY[r].label}
                  </button>
                ))}
              </div>
              <p {...sx(a.small)}>{ROLE_COPY[role].hint}</p>
              <div {...sx(s.linkBox)}>
                <Link2 size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, a.muted)} />
                <span {...sx(a.mono, a.truncate, a.grow, !invite && a.muted)}>
                  {invite ? inviteUrl(invite.token).replace(/^https?:\/\//, "") : "A private link is created when you copy it"}
                </span>
              </div>
              <div {...sx(a.rowWrap)}>
                <button type="button" {...sx(a.btn, a.btnPrimary, a.grow)} disabled={busy !== null} onClick={() => void copyLink()}>
                  {busy === "copy" ? <Spinner /> : copied ? <Check size={16} aria-hidden /> : <Copy size={16} strokeWidth={1.75} aria-hidden />}
                  {copied ? "Link copied" : "Copy invite link"}
                </button>
                {invite && (
                  <button type="button" {...sx(a.btn, a.btnGhost)} disabled={busy !== null} onClick={() => void resetLink()}>
                    Turn off link
                  </button>
                )}
              </div>
              <p {...sx(a.small)} role="status" aria-live="polite">
                {copied ? "Anyone who opens it and signs in joins this trip." : ""}
              </p>
            </section>
          )}

          <section aria-label="People on this trip">
            <p {...sx(a.eyebrow)}>On this trip</p>
            <ul {...sx(s.people)}>
              <li {...sx(s.person)}>
                <span {...sx(s.avatar)}>
                  <UserRound size={16} strokeWidth={1.75} aria-hidden />
                </span>
                <span {...sx(a.grow, a.truncate, s.personName)}>{owner ? "You" : "Trip owner"}</span>
                <span {...sx(a.chip)}>Owner</span>
              </li>
              {trip.collaborators.map((person, index) => {
                const self = viewerId !== null && person.userId === viewerId
                return (
                  <li key={person.userId} {...sx(s.person)}>
                    <span {...sx(s.avatar)}>
                      {(person.name ?? "").trim().charAt(0).toUpperCase() || <UserRound size={16} strokeWidth={1.75} aria-hidden />}
                    </span>
                    <span {...sx(a.grow, a.truncate, s.personName)}>
                      {self ? "You" : person.name || `Guest ${index + 1}`}
                    </span>
                    {owner ? (
                      <>
                        <select
                          aria-label={`Role for ${person.name || `guest ${index + 1}`}`}
                          value={person.role}
                          disabled={busy !== null}
                          {...sx(s.roleSelect)}
                          onChange={(event) =>
                            void saveCollaborators(
                              `role-${person.userId}`,
                              trip.collaborators.map((c) =>
                                c.userId === person.userId ? { ...c, role: event.target.value as CollaboratorRole } : c,
                              ),
                            )
                          }
                        >
                          <option value="viewer">Can view</option>
                          <option value="editor">Can edit</option>
                        </select>
                        <button
                          type="button"
                          {...sx(a.iconBtn, a.iconBtnSm)}
                          aria-label={`Remove ${person.name || `guest ${index + 1}`}`}
                          disabled={busy !== null}
                          onClick={() =>
                            void saveCollaborators(
                              `remove-${person.userId}`,
                              trip.collaborators.filter((c) => c.userId !== person.userId),
                            )
                          }
                        >
                          <X size={16} strokeWidth={1.75} aria-hidden />
                        </button>
                      </>
                    ) : (
                      <span {...sx(a.chip)}>{ROLE_COPY[person.role].label}</span>
                    )}
                  </li>
                )
              })}
            </ul>
            {trip.collaborators.length === 0 && !trip.sharedWithAllUsers && (
              <p {...sx(a.small)}>Only you so far. Copy the link above to bring someone along.</p>
            )}
          </section>

          {!owner && viewerId !== null && trip.collaborators.some((c) => c.userId === viewerId) && (
            <button type="button" {...sx(a.btn, a.btnSecondary)} disabled={busy !== null} onClick={() => void leave()}>
              {busy === "leave" ? <Spinner /> : <LogOut size={16} strokeWidth={1.75} aria-hidden />}
              Leave this trip
            </button>
          )}

          {error && (
            <p {...sx(a.alert)} role="alert">
              That didn’t go through. ({error})
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
