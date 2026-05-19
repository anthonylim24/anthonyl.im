// server/src/igPlaces/eval/score.ts
import { canonicalize, levenshteinNormalized } from '../extractPlaces';
import { haversineMeters } from '../geocode';
import type { EnrichedPlace, IgPlaceCategory } from '../types';

export interface ExpectedPlace {
  name: string;
  is_subject: boolean;
  category: IgPlaceCategory;
  lat: number;
  lng: number;
}

export interface FixtureScore {
  extPrecision: number;
  extRecall: number;
  catAccuracy: number;
  geoAccuracy: number;
  matched: number;
  emitted: number;
  expected: number;
}

function fuzzyEq(a: string, b: string): boolean {
  const ca = canonicalize(a), cb = canonicalize(b);
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true;
  return levenshteinNormalized(ca, cb) <= 2;
}

export function scoreFixture(got: EnrichedPlace[], expected: ExpectedPlace[]): FixtureScore {
  let catHits = 0, geoHits = 0, matched = 0;
  const usedExpected = new Set<number>();
  for (const g of got) {
    const idx = expected.findIndex((e, i) =>
      !usedExpected.has(i) && fuzzyEq(g.name, e.name) && g.is_subject === e.is_subject);
    if (idx === -1) continue;
    matched++;
    usedExpected.add(idx);
    const e = expected[idx];
    if (g.category === e.category) catHits++;
    if (g.lat != null && g.lng != null && haversineMeters(g.lat, g.lng, e.lat, e.lng) <= 100) geoHits++;
  }
  return {
    extPrecision: got.length ? matched / got.length : 0,
    extRecall:    expected.length ? matched / expected.length : 0,
    catAccuracy:  matched ? catHits / matched : 0,
    geoAccuracy:  matched ? geoHits / matched : 0,
    matched, emitted: got.length, expected: expected.length,
  };
}
