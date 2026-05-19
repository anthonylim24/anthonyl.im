import { test, expect, describe } from 'bun:test';
import { scoreFixture } from './score';
import type { EnrichedPlace } from '../types';

const got: EnrichedPlace = {
  name: '어니언 성수', name_romanized: 'Onion Seongsu', city: 'Seoul', category: 'cafe',
  confidence: 0.95, is_subject: true, supporting_quote: 'q',
  signal_source: 'caption', vote_count: 3, confidence_band: 'high',
  address: 'X', lat: 37.5447, lng: 127.0556, google_place_id: 'GP',
  phone: null, rating: 4.6, business_types: [],
  geocode_source: 'google+kakao', geocode_kakao_id: null, geocode_disagree: false,
};
const expected = { name: '어니언 성수', is_subject: true, category: 'cafe' as const, lat: 37.5447, lng: 127.0556 };

describe('scoreFixture', () => {
  test('100% precision/recall when extraction == expected', () => {
    const r = scoreFixture([got], [expected]);
    expect(r.extPrecision).toBe(1);
    expect(r.extRecall).toBe(1);
    expect(r.catAccuracy).toBe(1);
    expect(r.geoAccuracy).toBe(1);
  });
  test('halfway recall when one of two expected missing', () => {
    const r = scoreFixture([got], [expected, { name: 'Missing Place', is_subject: false, category: 'restaurant' as const, lat: 0, lng: 0 }]);
    expect(r.extRecall).toBe(0.5);
  });
});
