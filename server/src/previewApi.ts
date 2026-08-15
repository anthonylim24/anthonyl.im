import { BUN_IDLE_TIMEOUT_SEC } from "./httpIdleTimeout"
import { createPreviewApiApp } from "./previewApiApp"

const port = Number(process.env.PORT || 4100)
const hostname = process.env.PREVIEW_API_HOST || "127.0.0.1"
const app = createPreviewApiApp()

const server = Bun.serve({
  port,
  hostname,
  idleTimeout: BUN_IDLE_TIMEOUT_SEC,
  fetch: app.fetch,
})

console.log(`[preview-api] listening on ${hostname}:${server.port}`)
