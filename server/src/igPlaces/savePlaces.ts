// server/src/igPlaces/savePlaces.ts
import type { EnrichedPlace, PostPayload } from './types';
import type { SupabaseClient } from './supabase';

export function upsertPostFactory(sb: SupabaseClient) {
  return async function upsertPost(
    dedupeKey: string,
    url: string,
    payload: PostPayload,
    transcript: string | undefined,
    ocrText: string | undefined,
  ): Promise<number> {
    const rows = await sb.insert<{ id: number }>(
      'instagram_posts',
      {
        dedupe_key: dedupeKey,
        url,
        shortcode: payload.shortcode,
        owner_username: payload.ownerUsername ?? null,
        caption: payload.caption,
        transcript: transcript ?? null,
        ocr_text: ocrText ?? null,
        media_urls: payload.mediaItems,
        location_tag: payload.locationTag ?? null,
        raw: payload.raw,
        source: payload.source,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'dedupe_key', returning: 'representation' },
    );
    return rows[0].id;
  };
}

export function createSavePlaces(sb: SupabaseClient) {
  // Adaptive insert: prefer `on_conflict` so a watchdog-triggered retry is
  // idempotent. If the (post_id, user_id, name) unique index hasn't been
  // applied yet, Postgres returns 42P10 — fall back to a plain insert and
  // remember that the index is missing so subsequent saves skip the retry.
  let indexMissing = false;

  return async function savePlaces(
    postId: number,
    userId: string,
    places: EnrichedPlace[],
  ): Promise<void> {
    if (places.length === 0) return;
    const rows = places.map((p) => ({
      post_id: postId,
      user_id: userId,
      name: p.name,
      name_romanized: p.name_romanized,
      city: p.city,
      category: p.category,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      google_place_id: p.google_place_id,
      phone: p.phone,
      rating: p.rating,
      business_types: p.business_types,
      is_subject: p.is_subject,
      confidence: p.confidence,
      confidence_band: p.confidence_band,
      supporting_quote: p.supporting_quote,
      signal_source: p.signal_source,
      vote_count: p.vote_count,
      geocode_source: p.geocode_source,
      geocode_kakao_id: p.geocode_kakao_id,
      geocode_disagree: p.geocode_disagree,
    }));

    // Fire the inserts concurrently — each row is independent, so a serial
    // loop wastes ~N × (Supabase round-trip) where N is the place count.
    //
    // Error tolerance: a single per-row failure (e.g. an enum the model
    // invented that we didn't catch upstream — Postgres returns 22P02)
    // used to throw out of this function and lose the other N-1 rows
    // that saved fine. Now we collect successes + failures across the
    // batch and only throw if EVERY row failed AND there's at least one
    // non-recoverable error. Recoverable conditions:
    //   42P10 → unique index missing, fall back to plain insert
    //   22P02 → invalid enum (model output), drop the offending row
    //   23505 → duplicate (race vs another worker) — treat as success
    const recoverable = (msg: string) =>
      msg.includes('22P02') || msg.includes('23505');

    if (indexMissing) {
      await runConcurrent(rows, (row) => sb.insert('instagram_places', row), recoverable);
      return;
    }
    const settled = await Promise.allSettled(rows.map((row) =>
      sb.insert('instagram_places', row, { onConflict: 'post_id,user_id,name' }),
    ));
    const retries: typeof rows = [];
    let succeeded = 0;
    const fatals: unknown[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === 'fulfilled') { succeeded++; continue; }
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      if (msg.includes('42P10')) {
        if (!indexMissing) {
          console.warn(
            '[ig:save] (post_id,user_id,name) unique index missing — falling back to plain insert. ' +
            'Apply the latest schema migration to enable retry-idempotency.'
          );
          indexMissing = true;
        }
        retries.push(rows[i]);
      } else if (recoverable(msg)) {
        // Log + drop. The model produced something Postgres rejected
        // (e.g. an enum we don't yet alias). Don't kill the whole batch.
        console.warn(
          `[ig:save] dropping row "${rows[i].name}" — ${msg.slice(0, 200)}`,
        );
      } else {
        fatals.push(r.reason);
      }
    }
    if (retries.length) {
      await runConcurrent(retries, (row) => sb.insert('instagram_places', row), recoverable,
        (n) => { succeeded += n; });
    }
    // Re-throw only when nothing got saved AND we had hard failures.
    // If even one row landed, the job is "partially successful" — the
    // worker proceeds to mark the job done so the user sees what we did
    // extract instead of a red-banner failure.
    if (succeeded === 0 && fatals.length > 0) {
      throw fatals[0];
    }
  };
}

// Run inserts in parallel and tolerate per-row failures matching
// `recoverable`. Optional onSuccess callback for accumulating counters
// across the primary + retry passes.
async function runConcurrent<T>(
  rows: T[],
  fn: (row: T) => Promise<unknown>,
  recoverable: (msg: string) => boolean,
  onSuccess?: (n: number) => void,
): Promise<void> {
  const settled = await Promise.allSettled(rows.map(fn));
  let ok = 0;
  for (const r of settled) {
    if (r.status === 'fulfilled') { ok++; continue; }
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    if (!recoverable(msg)) throw r.reason;
    console.warn(`[ig:save] dropping row — ${msg.slice(0, 200)}`);
  }
  onSuccess?.(ok);
}
