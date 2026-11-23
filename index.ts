import app from './server/app.ts'
import { BUN_IDLE_TIMEOUT_SEC } from './server/src/httpIdleTimeout.ts'
import { HTTP_DRAIN_MS, onShutdown } from './server/src/shutdown.ts'

const server = Bun.serve({
  port: process.env.PORT || 3000,
  idleTimeout: BUN_IDLE_TIMEOUT_SEC,
  // SO_REUSEPORT, so deploy/restart.sh can run a second copy on the same port
  // while this one restarts. The systemd unit sets it; anywhere else a second
  // server on the port still fails loudly instead of quietly sharing it.
  reusePort: process.env.REUSE_PORT === '1',
  fetch: app.fetch,
})

console.log(`Listening on http://localhost:${server.port} ...`)

// On SIGTERM, stop listening at once (another process on the port takes new
// connections) and let the requests already here finish, for a bounded time.
onShutdown('http', () => Promise.race([server.stop(), Bun.sleep(HTTP_DRAIN_MS)]))

// A rejected promise nobody awaited must not take the server down; log it
// and keep serving. systemd still restarts the process on a real crash.
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled rejection:', reason)
})
