# `igPlaces` — Instagram → Korea trip place extractor

## Prerequisites

- `brew install yt-dlp ffmpeg`
- Env vars in `.env`:
  - `APIFY_TOKEN`
  - `GOOGLE_MAPS_API_KEY` (Places New API enabled)
  - `GOOGLE_VISION_API_KEY` (or reuse Maps key if Vision is enabled on the same project)
  - `KAKAO_REST_API_KEY` (optional)
  - `GROQ_API_KEY`
  - `CEREBRAS_API_KEY` (optional) — Cerebras Inference fallback used when Groq returns 429
    on the place extractor. Same `gpt-oss-120b` model, OpenAI-compatible API. Job logs
    show "Groq rate-limited; N/3 call(s) ran on Cerebras instead" when fallback fires.
  - `CLERK_SECRET_KEY`
  - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- `IG_WORKER_ENABLED=true` (default) to run the worker
- `IG_WORKER_ENABLED=false` to skip the worker (useful in tests, CI)

## Architecture

See `docs/superpowers/specs/2026-05-18-instagram-place-extractor-design.md`.

## Manual dry-run

```bash
bun run server/src/igPlaces/cli.ts https://www.instagram.com/p/ABC123
```

Runs the full pipeline against a real URL with real APIs. Prints structured
output. Does NOT touch Supabase.

## Tests

```bash
bun test                         # unit tests only
INTEGRATION=1 bun test           # unit + integration tests
bun run server/src/igPlaces/eval/run.ts   # accuracy eval against fixtures
```

## Submitting a real URL through the queue

```bash
curl -X POST https://anthonyl.im/api/korea/places/from-instagram \
  -H "Authorization: Bearer $CLERK_JWT" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/p/ABC123"}'
```

Returns `202` and a job id. Poll the `instagram_jobs` table or `_stats` for state.

## Dev shortcut: static bearer

For local testing without juggling short-lived Clerk JWTs, set:

```
IG_DEV_BEARER=any-long-random-string
IG_DEV_USER_ID=dev-user        # optional, default 'dev-user'
```

Then curl with that static string:

```bash
curl -X POST http://localhost:3000/api/korea/places/from-instagram \
  -H "Authorization: Bearer $IG_DEV_BEARER" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/p/ABC123"}'
```

**Never set `IG_DEV_BEARER` in production.** When unset (the default in
prod), the endpoint requires a real Clerk JWT.
