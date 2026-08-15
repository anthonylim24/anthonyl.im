/** Shared remapping for concierge SSE (Korea + trips). */

export function isLostConnection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /network\s*error|failed to fetch|load failed|opaqueredirect/i.test(message)
}

export function remapChatFailure(err: unknown): Error {
  if (err instanceof DOMException && err.name === "AbortError") return err
  if (isLostConnection(err)) {
    return new Error("The concierge lost its connection. Please try again.")
  }
  return err instanceof Error ? err : new Error(String(err))
}
