// Lookup table for the neighborhood names listed in koreaSnapshot.ts → days.
// Coordinates are rough centroids (visually checked on Google Maps); the
// `radiusM` is the half-extent of the visual highlight we draw on Map Mode,
// not the literal administrative boundary. A few entries cover broad
// districts (Haeundae ~1km) while others are tight (a single street).

export interface NeighborhoodCenter {
  name: string;
  lat: number;
  lng: number;
  /** Highlight radius in meters. */
  radiusM: number;
}

/** Strip "(AM)" / "(PM)" / etc. suffixes from a day-snapshot name so the
 *  lookup matches the canonical entry. */
function canonicalize(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const TABLE: Record<string, NeighborhoodCenter> = {
  // Seoul
  'Apgujeong':              { name: 'Apgujeong',              lat: 37.5274, lng: 127.0286, radiusM: 600 },
  'Apgujeong Rodeo':        { name: 'Apgujeong Rodeo',        lat: 37.5275, lng: 127.0397, radiusM: 400 },
  'Bongeunsa':              { name: 'Bongeunsa',              lat: 37.5145, lng: 127.0573, radiusM: 250 },
  'Bukchon':                { name: 'Bukchon',                lat: 37.5826, lng: 126.9836, radiusM: 500 },
  'Cheongdam':              { name: 'Cheongdam',              lat: 37.5237, lng: 127.0500, radiusM: 600 },
  'Cheongdam Luxury Street':{ name: 'Cheongdam Luxury Street',lat: 37.5237, lng: 127.0468, radiusM: 350 },
  'COEX':                   { name: 'COEX',                   lat: 37.5117, lng: 127.0594, radiusM: 350 },
  'Dosan':                  { name: 'Dosan',                  lat: 37.5247, lng: 127.0388, radiusM: 350 },
  'Hannam':                 { name: 'Hannam',                 lat: 37.5366, lng: 127.0008, radiusM: 600 },
  'ICN':                    { name: 'Incheon Airport',        lat: 37.4602, lng: 126.4407, radiusM: 1000 },
  'Itaewon':                { name: 'Itaewon',                lat: 37.5343, lng: 126.9942, radiusM: 600 },
  'Jamsil':                 { name: 'Jamsil',                 lat: 37.5133, lng: 127.1000, radiusM: 700 },
  'Jangheung-myeon':        { name: 'Jangheung-myeon',        lat: 37.8167, lng: 126.9333, radiusM: 1500 },
  'Jongno':                 { name: 'Jongno',                 lat: 37.5704, lng: 126.9831, radiusM: 800 },
  'Myeongdong':             { name: 'Myeongdong',             lat: 37.5635, lng: 126.9849, radiusM: 500 },
  'Samcheong':              { name: 'Samcheong',              lat: 37.5862, lng: 126.9805, radiusM: 400 },
  'Samseong':               { name: 'Samseong',               lat: 37.5145, lng: 127.0571, radiusM: 500 },
  'Seochon':                { name: 'Seochon',                lat: 37.5793, lng: 126.9701, radiusM: 500 },
  'Seokchon Lake':          { name: 'Seokchon Lake',          lat: 37.5111, lng: 127.1066, radiusM: 600 },
  'Seongsu':                { name: 'Seongsu',                lat: 37.5446, lng: 127.0560, radiusM: 700 },
  'Seoul Forest':           { name: 'Seoul Forest',           lat: 37.5443, lng: 127.0379, radiusM: 500 },
  'Sinsa':                  { name: 'Sinsa',                  lat: 37.5198, lng: 127.0265, radiusM: 500 },
  'Songpa':                 { name: 'Songpa',                 lat: 37.5145, lng: 127.1066, radiusM: 700 },
  'Ttukseom':               { name: 'Ttukseom',               lat: 37.5311, lng: 127.0670, radiusM: 600 },
  'Yeonmujang-gil':         { name: 'Yeonmujang-gil',         lat: 37.5448, lng: 127.0635, radiusM: 300 },
  'Yongsan':                { name: 'Yongsan',                lat: 37.5384, lng: 126.9650, radiusM: 700 },

  // Busan
  'Cheongsapo':             { name: 'Cheongsapo',             lat: 35.1626, lng: 129.1933, radiusM: 350 },
  'Gwangalli':              { name: 'Gwangalli',              lat: 35.1531, lng: 129.1186, radiusM: 800 },
  'Haeundae':               { name: 'Haeundae',               lat: 35.1586, lng: 129.1604, radiusM: 1000 },
  'Mipo':                   { name: 'Mipo',                   lat: 35.1683, lng: 129.1789, radiusM: 350 },
};

/** Resolve a day's neighborhood-name list to coordinate centers. Drops names
 *  we don't recognize (returns the subset that resolves). */
export function resolveNeighborhoodCenters(names: string[]): NeighborhoodCenter[] {
  const seen = new Set<string>();
  const out: NeighborhoodCenter[] = [];
  for (const raw of names) {
    const key = canonicalize(raw);
    const center = TABLE[key];
    if (!center || seen.has(key)) continue;
    seen.add(key);
    out.push(center);
  }
  return out;
}
