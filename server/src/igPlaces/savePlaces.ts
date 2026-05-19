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
  return async function savePlaces(
    postId: number,
    userId: string,
    places: EnrichedPlace[],
  ): Promise<void> {
    for (const p of places) {
      await sb.insert(
        'instagram_places',
        {
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
        },
        { onConflict: 'post_id,user_id,name' },
      );
    }
  };
}
