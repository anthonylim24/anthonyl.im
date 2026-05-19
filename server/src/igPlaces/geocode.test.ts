// server/src/igPlaces/geocode.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createGeocoder, haversineMeters, withinKoreaBbox } from './geocode';
import type { VotedPlace, LocationTag } from './types';

const base: VotedPlace = {
  name: '어니언 성수', name_romanized: 'Onion Seongsu', city: 'Seoul', category: 'cafe',
  confidence: 0.9, is_subject: true, supporting_quote: '어니언 성수',
  signal_source: 'caption', vote_count: 3, confidence_band: 'high',
};

describe('helpers', () => {
  test('haversineMeters near zero for same point', () => {
    expect(haversineMeters(37.5, 127, 37.5, 127)).toBeLessThan(0.001);
  });
  test('haversineMeters ~111km for 1° lat', () => {
    expect(haversineMeters(37, 127, 38, 127)).toBeGreaterThan(110_000);
    expect(haversineMeters(37, 127, 38, 127)).toBeLessThan(112_000);
  });
  test('Korea bbox accepts Seoul, rejects Tokyo', () => {
    expect(withinKoreaBbox(37.5, 127)).toBe(true);
    expect(withinKoreaBbox(35.7, 139.7)).toBe(false);
  });
});

describe('createGeocoder', () => {
  test('apify-tag short-circuit: fuzzy-match + has lat/lng → skip APIs', async () => {
    const tag: LocationTag = { name: '어니언 성수', lat: 37.5447, lng: 127.0556 };
    const google = mock(async () => null);
    const kakao = mock(async () => null);
    const g = createGeocoder({ googleLookup: google, kakaoLookup: kakao });
    const out = await g(base, tag);
    expect(out.geocode_source).toBe('apify-tag');
    expect(out.lat).toBe(37.5447);
    expect(google).not.toHaveBeenCalled();
  });

  test('both succeed and agree → google+kakao, band bumped low→medium', async () => {
    const lowConf: VotedPlace = { ...base, confidence_band: 'low' };
    const g = createGeocoder({
      googleLookup: mock(async () => ({
        place_id: 'GP', name: '어니언 성수', address: '...', lat: 37.5447, lng: 127.0556,
        types: ['cafe'], rating: 4.6, userRatingCount: 1200, phone: '02-...',
      })),
      kakaoLookup: mock(async () => ({
        id: 'K1', name: '어니언 성수', address: '...', lat: 37.5448, lng: 127.0557, url: 'https://...',
      })),
    });
    const out = await g(lowConf, undefined);
    expect(out.geocode_source).toBe('google+kakao');
    expect(out.geocode_disagree).toBe(false);
    expect(out.confidence_band).toBe('medium');
  });

  test('disagree → google saved, geocode_disagree=true, band forced low', async () => {
    const high: VotedPlace = { ...base, confidence_band: 'high' };
    const g = createGeocoder({
      googleLookup: mock(async () => ({
        place_id: 'GP', name: '어니언 성수', address: 'X', lat: 37.5447, lng: 127.0556,
        types: ['cafe'], rating: 4.6, userRatingCount: 1200, phone: null,
      })),
      kakaoLookup: mock(async () => ({
        id: 'K2', name: '엉뚱한 카페', address: 'Y', lat: 37.5000, lng: 127.1000, url: 'u',
      })),
    });
    const out = await g(high, undefined);
    expect(out.geocode_disagree).toBe(true);
    expect(out.confidence_band).toBe('low');
  });

  test('google fails quality bar (rating<10) → falls to kakao', async () => {
    const g = createGeocoder({
      googleLookup: mock(async () => ({
        place_id: 'GP', name: 'Totally Different Name', address: 'X',
        lat: 37.5, lng: 127, types: ['cafe'], rating: 4, userRatingCount: 2, phone: null,
      })),
      kakaoLookup: mock(async () => ({
        id: 'K', name: '어니언 성수', address: 'KA', lat: 37.5, lng: 127.05, url: 'u',
      })),
    });
    const out = await g(base, undefined);
    expect(out.geocode_source).toBe('kakao');
  });

  test('both fail → ungeocoded, geocode_source=null', async () => {
    const g = createGeocoder({
      googleLookup: mock(async () => null), kakaoLookup: mock(async () => null),
    });
    const out = await g(base, undefined);
    expect(out.geocode_source).toBeNull();
    expect(out.lat).toBeNull();
  });
});
