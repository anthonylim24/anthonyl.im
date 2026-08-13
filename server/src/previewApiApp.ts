import { Hono, type Context, type Next } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { prettyJSON } from "hono/pretty-json"

import { config } from "./config"
import { errorHandler } from "./middleware/error"
import { createRateLimit } from "./middleware/rateLimit"
import { createClerkAuth, verifyClerkOptional } from "./middleware/clerkAuth"
import invokeRouter from "./routes/invoke"
import koreaRouter from "./routes/korea"
import entityRouter from "./routes/entity"
import { createInstagramPlacesRouter } from "./routes/instagramPlaces"
import { createTripsRouter } from "./routes/trips"
import { getTripStore } from "./trips/store"
import { createGoogleGeocoder, createTripsLlm } from "./trips/ai"
import {
  getQueue,
  listExtractedPlaces,
  listIgPlaceDays,
  listJobsForUser,
  setIgPlaceDays,
} from "./igPlaces/wire"

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
} as const

/**
 * API-only Hono app for remote PR previews. Same `/api/*` routes as
 * production, but no static SPA, no preview-file router (avoids recursion),
 * and no IG worker boot. Binds to loopback; production proxies
 * `/preview/pr/:n/api/*` here.
 */
export function createPreviewApiApp(): Hono {
  const app = new Hono()

  app.use(
    "*",
    logger(),
    prettyJSON(),
    cors({
      origin: config.corsOrigin,
      credentials: true,
      exposeHeaders: ["Content-Type", "X-Preview-API"],
      allowMethods: ["POST", "GET", "PUT", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    }),
    errorHandler,
  )

  const applySse = async (c: Context, next: Next) => {
    Object.entries(sseHeaders).forEach(([key, value]) => {
      c.header(key, value)
    })
    await next()
  }
  app.use("/api/invoke/*", applySse)
  app.use("/api/korea/chat", applySse)
  app.use("/api/trips/:id/chat", applySse)

  app.use("/api/invoke/*", createRateLimit({ windowMs: 60_000, max: 20, keyPrefix: "preview-invoke" }))
  app.use("/api/entity/*", createRateLimit({ windowMs: 60_000, max: 30, keyPrefix: "preview-entity" }))
  const tripsRateLimit = createRateLimit({ windowMs: 60_000, max: 60, keyPrefix: "preview-trips" })
  app.use("/api/trips/*", tripsRateLimit)
  app.use("/api/trips/:id/*", tripsRateLimit)

  app.route("/api/invoke", invokeRouter)
  app.route("/api/korea", koreaRouter)
  app.route("/api/entity", entityRouter)
  app.route(
    "/api/trips",
    createTripsRouter({
      store: getTripStore(),
      verifyAuth: (authHeader) =>
        verifyClerkOptional(authHeader, {
          secretKey: config.clerkSecretKey,
          devBearer: config.igDevBearer,
          devUserId: config.igDevUserId,
        }),
      llm: createTripsLlm({
        geminiApiKey: config.geminiApiKey,
        groqApiKey: config.groqApiKey,
      }),
      geocode: config.googleMapsApiKey ? createGoogleGeocoder(config.googleMapsApiKey) : null,
    }),
  )

  const clerkAuth =
    config.clerkSecretKey || config.igDevBearer
      ? createClerkAuth({
          secretKey: config.clerkSecretKey,
          devBearer: config.igDevBearer,
          devUserId: config.igDevUserId,
        })
      : null

  if (clerkAuth) {
    const igPlacesRouter = createInstagramPlacesRouter({
      enqueue: (userId, url, opts) => getQueue().enqueue(userId, url, opts),
      statsHandler: async () => {
        try {
          const counts = await getQueue().stats()
          return { enabled: false, ...counts }
        } catch {
          return { enabled: false, error: "stats unavailable" }
        }
      },
      listJobs: listJobsForUser,
      retryJob: (jobId, userId) => getQueue().retryJob(jobId, userId),
      reextractJob: (jobId, userId) => getQueue().reextractJob(jobId, userId),
      listExtractedPlaces,
      listIgPlaceDays,
      setIgPlaceDays,
    })
    app.use("/api/korea/places/from-instagram/*", clerkAuth)
    app.route("/api/korea/places/from-instagram", igPlacesRouter)
  }

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      previewApi: true,
      timestamp: new Date().toISOString(),
    }),
  )

  return app
}
