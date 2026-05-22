// server/src/igPlaces/backfillBusyness.ts
//
// One-shot CLI that backfills busyness for existing instagram_places rows
// where busyness IS NULL. Idempotent + resumable — only touches rows that
// haven't been classified yet, so it's safe to run twice.
//
// Usage:
//   bun run server/src/igPlaces/backfillBusyness.ts            # full backfill
//   bun run server/src/igPlaces/backfillBusyness.ts --limit 5  # cap rows
//   bun run server/src/igPlaces/backfillBusyness.ts --dry-run  # no writes
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional env: GEMINI_API_KEY, KAKAO_REST_API_KEY — without these the
// fetcher returns category-based inference at low confidence (still useful
// as a placeholder until a real key is available).

import { config } from '../config';
import { createSupabaseClient, type SupabaseClient } from './supabase';
import { createBusynessFetcher } from './fetchBusyness';
import type { BusynessLevel, BusynessSource, IgPlaceCategory } from './types';

interface CliOpts {
  limit: number | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOpts {
  let limit: number | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--limit') {
      const n = Number(argv[i + 1]);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit expects a positive integer; got "${argv[i + 1]}"`);
      }
      limit = n;
      i++;
    } else if (a.startsWith('--limit=')) {
      const n = Number(a.slice('--limit='.length));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit expects a positive integer; got "${a}"`);
      }
      limit = n;
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: bun run server/src/igPlaces/backfillBusyness.ts [--limit N] [--dry-run]'
      );
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  return { limit, dryRun };
}

interface PlaceRow {
  id: number;
  name: string;
  name_romanized: string | null;
  city: string | null;
  category: IgPlaceCategory;
  lat: number | null;
  lng: number | null;
  geocode_kakao_id: string | null;
  busyness: BusynessLevel | null;
}

export async function runBackfill(
  sb: SupabaseClient,
  fetchBusyness: ReturnType<typeof createBusynessFetcher>,
  opts: CliOpts,
  log: (msg: string) => void = console.log,
): Promise<{ processed: number; updated: number; skipped: number; failed: number }> {
  // PostgREST encodes "IS NULL" via `?col=is.null`. The generic select helper
  // sends `col=eq.<value>`, which can't express this — so we go direct via
  // fetch for the read step, then use the sb client for the per-row PATCH.
  const url = new URL(`${config.supabaseUrl}/rest/v1/instagram_places`);
  url.searchParams.set(
    'select',
    'id,name,name_romanized,city,category,lat,lng,geocode_kakao_id,busyness',
  );
  url.searchParams.set('busyness', 'is.null');
  url.searchParams.set('order', 'id.asc');
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));

  const r = await fetch(url.toString(), {
    headers: {
      apikey: config.supabaseServiceKey!,
      Authorization: `Bearer ${config.supabaseServiceKey!}`,
      Accept: 'application/json',
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`supabase select failed ${r.status}: ${body.slice(0, 200)}`);
  }
  const todo = (await r.json()) as PlaceRow[];

  log(`[backfill] found ${todo.length} rows with busyness=null${opts.dryRun ? ' (dry-run)' : ''}`);
  if (todo.length === 0) return { processed: 0, updated: 0, skipped: 0, failed: 0 };

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < todo.length; i++) {
    const row = todo[i];
    const progress = `${i + 1}/${todo.length}`;
    if (row.busyness !== null) {
      // Defensive — the query already filters this out, but a race could
      // sneak a row in. Keep it idempotent.
      skipped++;
      continue;
    }
    let result: { busyness: BusynessLevel; source: BusynessSource; confidence: number };
    try {
      result = await fetchBusyness({
        name: row.name,
        name_romanized: row.name_romanized,
        city: row.city,
        category: row.category,
        lat: row.lat,
        lng: row.lng,
        geocode_kakao_id: row.geocode_kakao_id,
      });
    } catch (err) {
      failed++;
      log(`[backfill] ${progress} ${row.name} → FAILED: ${(err as Error).message}`);
      continue;
    }

    const tag = `${result.source}, ${result.confidence.toFixed(2)}`;
    log(`[backfill] ${progress} ${row.name} → ${result.busyness} (${tag})`);

    if (opts.dryRun) continue;

    try {
      await sb.update(
        'instagram_places',
        {
          busyness: result.busyness,
          busyness_source: result.source,
          busyness_confidence: result.confidence,
        },
        { id: row.id },
      );
      updated++;
    } catch (err) {
      failed++;
      log(`[backfill] ${progress} ${row.name} → PATCH FAILED: ${(err as Error).message}`);
    }
  }

  log(
    `[backfill] done — processed=${todo.length} updated=${updated} skipped=${skipped} failed=${failed}`,
  );
  return { processed: todo.length, updated, skipped, failed };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error(
      'backfillBusyness: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env',
    );
  }
  if (!config.geminiApiKey && !config.kakaoRestApiKey) {
    console.warn(
      '[backfill] WARNING: neither GEMINI_API_KEY nor KAKAO_REST_API_KEY is set — '
        + 'rows will be tagged with category-only inference at confidence 0.2.',
    );
  }

  const sb = createSupabaseClient({
    url: config.supabaseUrl,
    serviceKey: config.supabaseServiceKey,
  });
  const fetchBusyness = createBusynessFetcher({
    geminiApiKey: config.geminiApiKey,
    kakaoApiKey: config.kakaoRestApiKey,
  });

  await runBackfill(sb, fetchBusyness, opts);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('[backfill] fatal:', err);
    process.exit(1);
  });
}
