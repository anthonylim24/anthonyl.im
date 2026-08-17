import app from './server/app.ts'
import { BUN_IDLE_TIMEOUT_SEC } from './server/src/httpIdleTimeout.ts'

const server = Bun.serve({
  port: process.env.PORT || 3000,
  idleTimeout: BUN_IDLE_TIMEOUT_SEC,
  fetch: app.fetch,
})

console.log(`Listening on http://localhost:${server.port} ...`)