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

export interface GeocoderDeps {
  googleLookup: (name: string, city: string | null) => Promise<GoogleResult | null>;
  kakaoLookup:  (name: string, city: string | null) => Promise<KakaoResult | null>;
}

export type Geocoder = (place: VotedPlace, tag: LocationTag | undefined) => Promise<EnrichedPlace>;

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
  return async function geocode(place, tag) {
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
      deps.googleLookup(place.name, place.city).catch(err => {
        console.warn('[ig:geocode] google failed:', err?.message ?? err);
        return null;
      }),
      deps.kakaoLookup(place.name, place.city).catch(err => {
        console.warn('[ig:geocode] kakao failed:', err?.message ?? err);
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
export function realGoogleLookup(apiKey: string, f = fetch) {
  return async (name: string, city: string | null): Promise<GoogleResult | null> => {
    const query = `${name}${city ? ', ' + city : ''}`;
    const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
    const r1 = await f(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.types,' +
          'places.rating,places.userRatingCount,places.internationalPhoneNumber',
      },
      body: JSON.stringify({ textQuery: query, regionCode: 'KR', languageCode: 'en' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r1.ok) return null;
    const data = (await r1.json()) as { places?: any[] };
    const top = data.places?.[0];
    if (!top) return null;
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
  };
}

export function realKakaoLookup(apiKey: string, f = fetch) {
  return async (name: string, city: string | null): Promise<KakaoResult | null> => {
    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.set('query', `${name}${city ? ' ' + city : ''}`);
    const r = await f(url.toString(), { headers: { Authorization: `KakaoAK ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const data = (await r.json()) as { documents?: Array<{
      id: string; place_name: string; road_address_name?: string; address_name: string;
      x: string; y: string; place_url: string;
    }>; };
    const d = data.documents?.[0];
    if (!d) return null;
    return {
      id: d.id,
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      lat: Number(d.y),
      lng: Number(d.x),
      url: d.place_url,
    };
  };
}
