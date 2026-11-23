# Environment variables

Source of truth: `server/src/config.ts` (server) and `frontend/.env.example` (frontend).

Nothing is required at boot: a missing key degrades its feature and is logged.

Required for Clerk-gated **production** (`/trips`, `/trips/korea-2026`, IG ingest). Without it, JWT verification fails and `/api/trips` (and other gated routes) return 401:
- `CLERK_SECRET_KEY` — Clerk JWT verification (`server/src/middleware/clerkAuth.ts`: signing keys are cached and refreshed in the background every 5 minutes; only a key id not seen yet waits for a fetch, at most every 10 s). Also mounts the Clerk Frontend API proxy at `/__clerk/*` (`server/src/clerkProxy.ts`), which forwards to Clerk with `CLERK_PROXY_URL` (default `https://anthonyl.im/__clerk`). The browser uses it only when the build sets `VITE_CLERK_PROXY_URL` (GitHub Actions variable), and the production instance's domain must have the same proxy URL set in Clerk. Google sign-in finishes at `/sign-in#/sso-callback`: the sign-in modal takes that base from the instance's display config, not from `ClerkProvider`'s `signInUrl`, so the production instance's `paths.sign_in` / `paths.sign_up` must stay `/sign-in` / `/sign-up` (otherwise Clerk falls back to the `accounts.` Account Portal, which some networks block)

Required when the IG worker is enabled (warns if missing):
- `APIFY_TOKEN` — Instagram post fetch (Apify's Instagram scraper; free plan is enough for personal use). `BRIGHT_DATA_API_KEY` is an optional paid fallback; yt-dlp is the last resort
- `GOOGLE_MAPS_API_KEY` — geocoding
- `GROQ_API_KEY` — backup models: `gpt-oss-120b` (extraction vote, trip AI, chatbot) and Whisper
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

Optional / feature-gated:
- `JEV_API_KEY` — optional. Jev, TypeSafe's classifier model, routes each Lim chat message (`server/src/lim/jev.ts`): regular chat (questions about Anthony or anything else) → `gemini-4-hydrogen`, playing with the jelly (orders and the toys Lim invents) → `gemini-4-neon`. Skipped when the page has no live 3D scene. Without the key, or if Jev fails or takes over 2 s, Hydrogen answers. `GEMINI_MODEL` does not change Lim's two models.
- `GEMINI_API_KEY` — the primary model everywhere (Gemini 4 Neon, `gemini-4-neon`): trip drafts and reviews, concierge and its follow-up chips, Instagram extraction, transcription and geocoding. Lim's chat is the exception: Jev routes it between Hydrogen and Neon (`JEV_API_KEY`, above). `GEMINI_MODEL` overrides the model for the rest (`server/src/igPlaces/gemini.ts`); when the key cannot use it, `gemini-3.8-flash` answers instead. Without the key the Groq backups run alone and the concierge is unavailable. The concierge's place search and directions use `GOOGLE_MAPS_API_KEY` (Places API (New) and Routes API), as does the planner's type-ahead place search (`/api/places/search`; without the key it falls back to OpenStreetMap) and the wishlist's place details (`/api/places/details`: photos, summary, hours; without the key it answers 503 and the popover falls back to Wikipedia or the idea's own notes). Wishlist day recommendations (`/api/trips/:id/ideas/suggest-days`) call Gemini 4 Hydrogen with `GEMINI_API_KEY`, pinned whatever `GEMINI_MODEL` says; without the key they rank days by distance
- `CEREBRAS_API_KEY` — Groq 429 fallback
- `GOOGLE_VISION_API_KEY` — defaults to Maps key
- `KAKAO_REST_API_KEY` — Korea geocode assist
- `AGENT_LOGIN_SECRET`, `CLERK_AGENT_USER_ID` / `CLERK_AGENT_USER_EMAIL`, `AGENT_GITHUB_REPO` — preview screenshot login
- `METRICS_TOKEN` — optional. `Authorization: Bearer <METRICS_TOKEN>` reads `/health/metrics` from off the droplet; unset, only a local request can (see [`observability.md`](observability.md))
- `IG_WORKER_*` — worker knobs. A job this process queues (or retries) starts at once; `IG_WORKER_POLL_MS` (default 60 s) is only the sweep for stale jobs, due retries and jobs a PR preview queued
- `TRIPS_REVIEW_WORKER` — the AI review queue's sweep (`server/src/trips/reviewWorker.ts`): every 60 s, and once at boot, it claims retries, runs whose worker died, and runs a restart left behind. Default on when `NODE_ENV=production`, off otherwise (so `bun test` starts no timers and a dev server holding real Supabase keys never claims production reviews). Off, a review still starts in this process the moment `/enhance` queues it, and retries its own failed attempts; set `TRIPS_REVIEW_WORKER=true` locally to exercise restarts
- `RATE_LIMITS=off` — **non-production** only: every rate limiter lets requests through, for local and e2e stacks where one dev user drives many tests at once (`frontend/playwright.config.ts` sets it). Ignored with a `[config] !!!` warning when `NODE_ENV=production`
- `IG_DEV_BEARER` / `VITE_DEV_BEARER` — **non-production** Clerk bypass only (compared in constant time). With `NODE_ENV=production` (the droplet and the PR-preview sidecar) both are ignored and the server logs one loud `[config] !!!` warning at boot if either is set; it does not refuse to start. **Never** set them in production or PR previews.

Frontend (`frontend/.env` from CI secret `FRONTEND_ENV`):
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- `VITE_POSTHOG_KEY`
- `VITE_GOOGLE_PLACES_API_KEY`, `VITE_GOOGLE_MAP_TILES_API_KEY` — the photoreal 3D view's tiles and place photos only. Trips maps (MapLibre + OpenFreeMap) and city search (Open-Meteo) need no key; place search adds Google results through the server's `GOOGLE_MAPS_API_KEY`
- `VITE_ENABLE_SERVICE_WORKER` — preview builds disable registration
- `VITE_API_BASE` / `VITE_BASE` — preview builds only

See `frontend/.env.example` and `server/src/config.ts`.
