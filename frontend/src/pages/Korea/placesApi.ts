// Fetch helpers for the extracted-places browser at /korea/places.

export type ExtractedPlace = {
  id: number;
  name: string;
  name_romanized: string | null;
  city: string | null;
  category: 'restaurant' | 'cafe' | 'bar' | 'shopping' | 'activity' | 'hotel' | 'landmark' | 'other';
  confidence: number;
  confidence_band: 'high' | 'medium' | 'low';
  is_subject: boolean;
  supporting_quote: string | null;
  signal_source: 'caption' | 'transcript' | 'ocr' | 'location_tag' | 'multiple' | null;
  vote_count: number;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  rating: number | null;
  business_types: string[];
  geocode_source: 'apify-tag' | 'google' | 'kakao' | 'google+kakao' | null;
  geocode_kakao_id: string | null;
  geocode_disagree: boolean;
  google_place_id: string | null;
  status: 'extracted' | 'verified' | 'rejected';
  created_at: string;
  post: {
    id: number;
    url: string;
    shortcode: string | null;
    owner_username: string | null;
    caption: string;
    fetched_at: string;
  };
};

export type ExtractedPlacesResponse = {
  places: ExtractedPlace[];
  total: number;
  hasMore: boolean;
};

export type PlacesFilter = {
  limit?: number;
  offset?: number;
  category?: string;
  band?: string;
  q?: string;
};

const BASE = '/api/korea/places/from-instagram';

async function authHeaders(
  getToken: () => Promise<string | null>,
): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchExtractedPlaces(
  getToken: () => Promise<string | null>,
  opts: PlacesFilter = {},
): Promise<ExtractedPlacesResponse> {
  const headers = await authHeaders(getToken);
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.category) params.set('category', opts.category);
  if (opts.band) params.set('band', opts.band);
  if (opts.q) params.set('q', opts.q);

  const qs = params.toString();
  const res = await fetch(`${BASE}/extracted${qs ? `?${qs}` : ''}`, { headers });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json() as Promise<ExtractedPlacesResponse>;
}
