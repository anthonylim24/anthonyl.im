# Environment variables

Source of truth: `server/src/config.ts` (server) and `frontend/.env.example` (frontend).

Always required at server boot (`config.ts` throws):
- `KLUSTER_API_KEY` + `KLUSTER_API_BASE_URL` — homepage chatbot LLM (Deepseek via Kluster)

Required for Clerk-gated **production** (`/trips`, `/trips/korea-2026`, IG ingest). Without it, JWT verification fails and `/api/trips` (and other gated routes) return 401:
- `CLERK_SECRET_KEY` — Clerk JWT verification (`server/src/middleware/clerkAuth.ts`). Also mounts the Clerk Frontend API proxy at `/__clerk/*` (`server/src/clerkProxy.ts`), which forwards to Clerk with `CLERK_PROXY_URL` (default `https://anthonyl.im/__clerk`). The browser uses it only when the build sets `VITE_CLERK_PROXY_URL` (GitHub Actions variable), and the production instance's domain must have the same proxy URL set in Clerk. Google sign-in finishes at `/sign-in#/sso-callback`: the sign-in modal takes that base from the instance's display config, not from `ClerkProvider`'s `signInUrl`, so the production instance's `paths.sign_in` / `paths.sign_up` must stay `/sign-in` / `/sign-up` (otherwise Clerk falls back to the `accounts.` Account Portal, which some networks block)

Required when the IG worker is enabled (warns if missing):
- `APIFY_TOKEN` — Instagram post fetch (Apify's Instagram scraper; free plan is enough for personal use). `BRIGHT_DATA_API_KEY` is an optional paid fallback; yt-dlp is the last resort
- `GOOGLE_MAPS_API_KEY` — geocoding
- `GROQ_API_KEY` — backup models: `gpt-oss-120b` (extraction vote, trip AI, entity blurbs, chatbot) and Whisper
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

Optional / feature-gated:
- `JEV_API_KEY` — optional. Jev, TypeSafe's classifier model, routes each Lim chat message (`server/src/lim/jev.ts`): asking about Anthony (or anything else) → `gemini-4-hydrogen`, playing with the jelly → `gemini-4-carbon`. Skipped when the page has no live 3D scene (Hydrogen). Without the key, or if Jev fails or takes over 2 s, the date default below answers.
- `LIM_GEMINI_MODEL` — optional. Pins the Gemini model for Lim's chat and skips Jev; otherwise Jev routes, and the fallback is `gemini-4-carbon` through December 1, 2026 and `gemini-4-hydrogen` after (`server/src/lim/model.ts`).
- `GEMINI_API_KEY` — the primary model everywhere (Gemini 4 Hydrogen): trip drafts and reviews, concierge, Instagram extraction and transcription, entity blurbs, chatbot. Without it the Groq backups run alone and the concierge is unavailable. The concierge's place search and directions use `GOOGLE_MAPS_API_KEY` (Places API (New) and Routes API)
- `CEREBRAS_API_KEY` — Groq 429 fallback
- `GOOGLE_VISION_API_KEY` — defaults to Maps key
- `KAKAO_REST_API_KEY` — Korea geocode assist
- `NOTION_TOKEN` — optional live Korea snapshot fetch
- `AGENT_LOGIN_SECRET`, `CLERK_AGENT_USER_ID` / `CLERK_AGENT_USER_EMAIL`, `AGENT_GITHUB_REPO` — preview screenshot login
- `IG_WORKER_*` — worker knobs
- `IG_DEV_BEARER` / `VITE_DEV_BEARER` — **non-production** Clerk bypass only. Inert when `NODE_ENV=production`. **Never** set in production or PR previews.

Frontend (`frontend/.env` from CI secret `FRONTEND_ENV`):
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- `VITE_POSTHOG_KEY`
- `VITE_GOOGLE_PLACES_API_KEY`, `VITE_GOOGLE_MAP_TILES_API_KEY` — the photoreal 3D view's tiles and place photos only. Trips maps (MapLibre + OpenFreeMap) and place/city search (Photon, Open-Meteo) need no key
- `VITE_ENABLE_SERVICE_WORKER` — preview builds disable registration
- `VITE_API_BASE` / `VITE_BASE` — preview builds only

See `frontend/.env.example` and `server/src/config.ts`.
