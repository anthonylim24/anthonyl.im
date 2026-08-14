const SSE_PING_MS = 10_000

/** Write an immediate SSE ping, then keep pinging until `work` settles so
 *  reverse proxies do not idle-timeout while Gemini thinks. Ping write
 *  failures (client gone) are swallowed so they cannot reject `work`. */
export async function withSsePings<T>(
  writePing: () => Promise<void>,
  work: Promise<T>,
  intervalMs = SSE_PING_MS,
): Promise<T> {
  const ping = () => writePing().catch(() => undefined)
  await ping()
  const timer = setInterval(() => {
    void ping()
  }, intervalMs)
  try {
    return await work
  } finally {
    clearInterval(timer)
  }
}
