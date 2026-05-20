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
    // The `indexMissing` adaptive-retry path needs special handling: we
    // first attempt every row with on-conflict; on a 42P10 from any row,
    // we flip the flag once and retry the failed ones plain. This is the
    // exact behavior the serial loop had, just batched.
    if (indexMissing) {
      await Promise.all(rows.map((row) => sb.insert('instagram_places', row)));
      return;
    }
    const settled = await Promise.allSettled(rows.map((row) =>
      sb.insert('instagram_places', row, { onConflict: 'post_id,user_id,name' }),
    ));
    const retries: typeof rows = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === 'fulfilled') continue;
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
      } else {
        throw r.reason;
      }
    }
    if (retries.length) {
      await Promise.all(retries.map((row) => sb.insert('instagram_places', row)));
    }
  };
}
