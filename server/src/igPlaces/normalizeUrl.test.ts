import { test, expect, describe } from 'bun:test';
import { normalizeInstagramUrl, isInstagramUrl } from './normalizeUrl';

describe('normalizeInstagramUrl', () => {
  test('lowercases host and strips trailing slash', () => {
    expect(normalizeInstagramUrl('https://WWW.Instagram.com/p/ABC123/'))
      .toBe('https://www.instagram.com/p/ABC123');
  });
  test('strips utm_* and igsh query params, keeps the rest', () => {
    expect(normalizeInstagramUrl('https://instagram.com/reel/XYZ?utm_source=ig&igsh=abc&foo=bar'))
      .toBe('https://www.instagram.com/reel/XYZ?foo=bar');
  });
  test('canonicalizes bare instagram.com to www.instagram.com', () => {
    expect(normalizeInstagramUrl('https://instagram.com/p/A'))
      .toBe('https://www.instagram.com/p/A');
  });
  test('rejects non-instagram hosts', () => {
    expect(() => normalizeInstagramUrl('https://twitter.com/x/y')).toThrow();
  });
  test('isInstagramUrl returns false for non-IG and true for IG', () => {
    expect(isInstagramUrl('https://foo.com/p/abc')).toBe(false);
    expect(isInstagramUrl('https://www.instagram.com/p/abc')).toBe(true);
    expect(isInstagramUrl('https://m.instagram.com/reel/abc')).toBe(true);
  });
  test('strips share/ redirect prefix', () => {
    expect(normalizeInstagramUrl('https://instagram.com/share/p/ABC'))
      .toBe('https://www.instagram.com/p/ABC');
  });
});
