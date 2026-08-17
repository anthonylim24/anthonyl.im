/** Shared remapping for concierge SSE (Korea + trips). */

export const CONCIERGE_CUTOFF_ERROR = "The concierge lost its connection. Please try again."

export function isLostConnection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /network\s*error|failed to fetch|load failed|opaqueredirect/i.test(message)
}

export function remapChatFailure(err: unknown): Error {
  if (err instanceof DOMException && err.name === "AbortError") return err
  if (isLostConnection(err)) {
    return new Error(CONCIERGE_CUTOFF_ERROR)
  }
  return err instanceof Error ? err : new Error(String(err))
}

/** Keep any tokens that already arrived, then surface the failure. */
export function formatConciergeError(content: string, error: string): string {
  const body = content.trim()
  return body ? `${body}\n\n⚠️ ${error}` : `⚠️ ${error}`
}

export function errorIfIncomplete(completed: boolean, existing?: string): string | undefined {
  if (existing) return existing
  return completed ? undefined : CONCIERGE_CUTOFF_ERROR
}
