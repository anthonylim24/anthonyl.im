// server/src/igPlaces/geocode.ts
import type { EnrichedPlace, LocationTag, VotedPlace, IgConfidenceBand } from './types';
import { canonicalize, levenshteinDistance, fuzzyEq } from './textMatch';

export interface GoogleResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  rating: number | null;
  userRatingCount: number;
  phone: string | null;
}

export interface KakaoResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  url: string;
}

/** Query context passed to a geocoding adapter. Adapters use whichever
 *  fields make sense — the Korean name typically wins on Kakao, the English
 *  on Google. Adapters can also use category as a hint (e.g., to disambiguate
 *  a restaurant from a tourist attraction with the same name). */
export interface LookupQuery {
  /** Primary (English) name as extracted by the LLM. */
  name: string;
  /** Local-script name (Korean Hangul, etc.) when the source was non-English. */
  nameRomanized?: string | null;
  city: string | null;
  /** LLM-extracted address if present — used as a fuzzy hint for the search. */
  address?: string | null;
  /** Place category — helps disambiguate. */
  category?: string;
}

export interface GeocoderDeps {
  googleLookup: (q: LookupQuery) => Promise<GoogleResult | null>;
  kakaoLookup:  (q: LookupQuery) => Promise<KakaoResult | null>;
}

export type GeocodeLog = (level: 'info'|'warn'|'error', message: string) => Promise<void> | void;

export interface GeocodeOpts {
  log?: GeocodeLog;
}

export type Geocoder = (place: VotedPlace, tag: LocationTag | undefined, opts?: GeocodeOpts) => Promise<EnrichedPlace>;

export function withinKoreaBbox(lat: number, lng: number): boolean {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  const dφ = (lat2 - lat1) * Math.PI/180, dλ = (lng2 - lng1) * Math.PI/180;
  const a = Math.sin(dφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function bumpBand(b: IgConfidenceBand): IgConfidenceBand {
  return b === 'low' ? 'medium' : b === 'medium' ? 'high' : 'high';
}

function googlePassesQualityBar(p: VotedPlace, g: GoogleResult): boolean {
  if (!withinKoreaBbox(g.lat, g.lng)) return false;
  if (p.category === 'restaurant' || p.category === 'cafe' || p.category === 'bar') {
    if (g.userRatingCount < 10 && levenshteinDistance(canonicalize(p.name), canonicalize(g.name)) > 1) {
      return false;
    }
  }
  return true;
}

export function createGeocoder(deps: GeocoderDeps): Geocoder {
  return async function geocode(place, tag, opts = {}) {
    const log = opts.log ?? (async () => {});
    // Apify location tag short-circuit: if tag has coordinates and name fuzzy-matches, trust it
    if (tag && tag.lat != null && tag.lng != null && fuzzyEq(place.name, tag.name)) {
      return {
        ...place,
        address: tag.name, lat: tag.lat, lng: tag.lng,
        google_place_id: null, phone: null, rating: null, business_types: [],
        geocode_source: 'apify-tag', geocode_kakao_id: null, geocode_disagree: false,
        confidence_band: bumpBand(place.confidence_band),
      };
    }

    const [googleRaw, kakao] = await Promise.all([
      deps.googleLookup({
        name: place.name,
        nameRomanized: place.name_romanized,
        city: place.city,
        address: place.address,
        category: place.category,
      }).catch(async (err) => {
        const msg = err?.message ?? String(err);
        console.warn('[ig:geocode] google failed:', msg);
        await log('warn', `Google Places lookup failed for "${place.name}": ${msg}`);
        return null;
      }),
      deps.kakaoLookup({
        name: place.name,
        nameRomanized: place.name_romanized,
        city: place.city,
        address: place.address,
        category: place.category,
      }).catch(async (err) => {
        const msg = err?.message ?? String(err);
        console.warn('[ig:geocode] kakao failed:', msg);
        await log('warn', `Kakao Local lookup failed for "${place.name}": ${msg}`);
        return null;
      }),
    ]);
    const google = googleRaw && googlePassesQualityBar(place, googleRaw) ? googleRaw : null;

    if (google && kakao) {
      const sameName = fuzzyEq(google.name, kakao.name);
      const close = haversineMeters(google.lat, google.lng, kakao.lat, kakao.lng) <= 200;
      const agree = sameName && close;
      return {
        ...place,
        address: google.address, lat: google.lat, lng: google.lng,
        google_place_id: google.place_id, phone: google.phone, rating: google.rating,
        business_types: google.types,
        geocode_source: agree ? 'google+kakao' : 'google',
        geocode_kakao_id: kakao.id,
        geocode_disagree: !agree,
        confidence_band: agree ? bumpBand(place.confidence_band) : 'low',
      };
    }
    if (google) {
      return {
        ...place,
        address: google.address, lat: google.lat, lng: google.lng,
        google_place_id: google.place_id, phone: google.phone, rating: google.rating,
        business_types: google.types,
        geocode_source: 'google', geocode_kakao_id: null, geocode_disagree: false,
      };
    }
    if (kakao) {
      return {
        ...place,
        address: kakao.address, lat: kakao.lat, lng: kakao.lng,
        google_place_id: null, phone: null, rating: null, business_types: [],
        geocode_source: 'kakao', geocode_kakao_id: kakao.id, geocode_disagree: false,
      };
    }
    // Both geocoders failed — but if the LLM extracted an explicit address from
    // the source text, surface it. Better than dropping the only useful field.
    return {
      ...place,
      address: place.address ?? null,
      lat: null, lng: null,
      google_place_id: null, phone: null, rating: null, business_types: [],
      geocode_source: null, geocode_kakao_id: null, geocode_disagree: false,
    };
  };
}

// Real adapters — used in production. Tests inject mocks.

/** Build the ordered list of query strings to try against Google Places. */
function googleQueries(q: LookupQuery): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (v && !seen.has(v)) {
      out.push(v);
      seen.add(v);
    }
  };
  // 1. English name + city — most precise for travelers
  if (q.city) push(`${q.name}, ${q.city}`);
  // 2. English name + LLM-supplied address (great hint when present)
  if (q.address) push(`${q.name}, ${q.address}`);
  // 3. Local-script name (Korean Hangul) + city — sometimes Google indexes
  //    a venue under its Korean name first
  if (q.nameRomanized) {
    push(q.city ? `${q.nameRomanized}, ${q.city}` : q.nameRomanized);
  }
  // 4. Bare English name — last resort
  push(q.name);
  return out;
}

/** Build the ordered list of query strings to try against Kakao Local. */
function kakaoQueries(q: LookupQuery): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (v && !seen.has(v)) {
      out.push(v);
      seen.add(v);
    }
  };
  // Kakao is a KR-native API — Korean name wins here.
  if (q.nameRomanized) {
    push(q.city ? `${q.nameRomanized} ${q.city}` : q.nameRomanized);
  }
  if (q.city) push(`${q.name} ${q.city}`);
  if (q.address) push(q.address);
  push(q.name);
  return out;
}

export function realGoogleLookup(apiKey: string, f = fetch) {
  return async (q: LookupQuery): Promise<GoogleResult | null> => {
    if (!apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY not configured');
    }
    const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.types,' +
        'places.rating,places.userRatingCount,places.internationalPhoneNumber',
    };
    // Capture the FIRST persistent API error (e.g. 403 referrer-blocked) so
    // we can re-throw it if no query variant succeeds. "Place not found" (200
    // with empty places[]) is treated as a soft miss — keep trying variants.
    let persistentError: { status: number; reason?: string; message: string } | null = null;
    for (const textQuery of googleQueries(q)) {
      const r = await f(searchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ textQuery, regionCode: 'KR', languageCode: 'en' }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        // Parse the Google error envelope to expose a clean message
        let reason: string | undefined;
        try {
          const parsed = JSON.parse(body) as { error?: { details?: Array<{ reason?: string }>; message?: string } };
          reason = parsed.error?.details?.[0]?.reason;
        } catch { /* not JSON */ }
        const msg = `${r.status} ${reason ?? 'http error'}`;
        console.warn(`[ig:geocode:google] ${msg} for query="${textQuery}"`);
        if (!persistentError) persistentError = { status: r.status, reason, message: msg };
        // 403 (auth / referrer / billing) won't be fixed by another query — bail fast
        if (r.status === 403 || r.status === 401) break;
        continue;
      }
      const data = (await r.json()) as { places?: any[] };
      const top = data.places?.[0];
      if (!top) continue;
      return {
        place_id: String(top.id),
        name: top.displayName?.text ?? '',
        address: top.formattedAddress ?? '',
        lat: top.location?.latitude ?? 0,
        lng: top.location?.longitude ?? 0,
        types: top.types ?? [],
        rating: top.rating ?? null,
        userRatingCount: top.userRatingCount ?? 0,
        phone: top.internationalPhoneNumber ?? null,
      };
    }
    if (persistentError) {
      // Re-throw so the per-job logger can surface it. Returning null here
      // would hide config issues (referrer-blocked key, no billing, etc.).
      const e = new Error(`Google Places ${persistentError.message}` +
        (persistentError.reason === 'API_KEY_HTTP_REFERRER_BLOCKED'
          ? ' — your GOOGLE_MAPS_API_KEY is restricted to HTTP referrers. ' +
            'Server-side calls need an IP-restricted or unrestricted key. ' +
            'Fix in Google Cloud Console → Credentials.'
          : ''));
      throw e;
    }
    return null;
  };
}

export function realKakaoLookup(apiKey: string, f = fetch) {
  return async (q: LookupQuery): Promise<KakaoResult | null> => {
    if (!apiKey) return null;
    for (const query of kakaoQueries(q)) {
      const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
      url.searchParams.set('query', query);
      const r = await f(url.toString(), {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        console.warn(`[ig:geocode:kakao] ${r.status} for query="${query}"`);
        continue;
      }
      const data = (await r.json()) as { documents?: Array<{
        id: string; place_name: string; road_address_name?: string; address_name: string;
        x: string; y: string; place_url: string;
      }>; };
      const d = data.documents?.[0];
      if (!d) continue;
      return {
        id: d.id,
        name: d.place_name,
        address: d.road_address_name || d.address_name,
        lat: Number(d.y),
        lng: Number(d.x),
        url: d.place_url,
      };
    }
    return null;
  };
}
