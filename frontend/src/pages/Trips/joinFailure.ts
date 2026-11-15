import { HttpStatusError, errorMessage } from "../../effect/errors"

/**
 * Why joining by invite link failed. `dead`: the server says the link is not
 * (or no longer) an invite, so trying again cannot help. `retry`: there was
 * no clear answer (offline, a timeout, a server error), so it may well work.
 */
export type JoinFailure = { kind: "dead" } | { kind: "retry"; detail: string }

export function joinFailure(err: unknown): JoinFailure {
  const message = errorMessage(err)
  if (/invite_not_found/i.test(message)) return { kind: "dead" }
  if (err instanceof HttpStatusError && (err.status === 400 || err.status === 404 || err.status === 410)) return { kind: "dead" }
  return { kind: "retry", detail: message }
}
