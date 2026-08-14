const SSE_PING_MS = 10_000

/** Write an immediate SSE ping, then keep pinging until `work` settles so
 *  reverse proxies do not idle-timeout while Gemini thinks. */
export async function withSsePings<T>(
  writePing: () => Promise<void>,
  work: Promise<T>,
): Promise<T> {
  await writePing()
  const timer = setInterval(() => {
    void writePing()
  }, SSE_PING_MS)
  try {
    return await work
  } finally {
    clearInterval(timer)
  }
}
