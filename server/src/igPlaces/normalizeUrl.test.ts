import { test, expect, describe } from 'bun:test';
import { normalizeInstagramUrl, isInstagramUrl } from './normalizeUrl';

describe('normalizeInstagramUrl', () => {
  test('lowercases host and strips trailing slash', () => {
    expect(normalizeInstagramUrl('https://WWW.Instagram.com/p/ABC123/'))
      .toBe('https://www.instagram.com/p/ABC123');
  });
  test('canonicalizes bare and mobile hosts to www.instagram.com', () => {
    expect(normalizeInstagramUrl('https://instagram.com/p/A')).toBe('https://www.instagram.com/p/A');
    expect(normalizeInstagramUrl('https://m.instagram.com/reel/B')).toBe('https://www.instagram.com/reel/B');
  });
  test('strips share/ redirect prefix', () => {
    expect(normalizeInstagramUrl('https://instagram.com/share/p/ABC'))
      .toBe('https://www.instagram.com/p/ABC');
  });
  test('keeps each post kind', () => {
    for (const kind of ['p', 'reel', 'reels', 'tv']) {
      expect(normalizeInstagramUrl(`https://www.instagram.com/${kind}/X_y-1/`))
        .toBe(`https://www.instagram.com/${kind}/X_y-1`);
    }
  });

  // Every one of these is the same post and must share one dedupe key.
  test.each([
    'https://www.instagram.com/reel/XYZ',
    'https://www.instagram.com/reel/XYZ/',
    'https://instagram.com/reel/XYZ?utm_source=ig&igsh=abc',
    'https://www.instagram.com/reel/XYZ/?foo=bar',
    'https://www.instagram.com/reel/XYZ/?igsh=1&img_index=2',
    'https://www.instagram.com/reel/XYZ/#comments',
    'https://www.instagram.com/reel/XYZ/embed/',
    'https://www.instagram.com/someone/reel/XYZ/',
    '  https://www.instagram.com/reel/XYZ  ',
  ])('%s → the canonical reel URL', (url) => {
    expect(normalizeInstagramUrl(url)).toBe('https://www.instagram.com/reel/XYZ');
  });

  test.each([
    ['http (not https)', 'http://www.instagram.com/p/ABC'],
    ['another host', 'https://twitter.com/x/y'],
    ['a look-alike host', 'https://instagram.com.evil.example/p/1'],
    ['a profile', 'https://www.instagram.com/someone/'],
    ['a profile reels tab', 'https://www.instagram.com/someone/reels/'],
    ['a story', 'https://www.instagram.com/stories/someone/123/'],
    ['explore', 'https://www.instagram.com/explore/tags/seoul/'],
    ['the home page', 'https://www.instagram.com/'],
    ['a post kind with no shortcode', 'https://www.instagram.com/p/'],
    ['not a url', 'instagram.com/p/ABC'],
  ])('rejects %s', (_label, url) => {
    expect(() => normalizeInstagramUrl(url)).toThrow();
    expect(isInstagramUrl(url)).toBe(false);
  });

  test('isInstagramUrl accepts posts on every IG host', () => {
    expect(isInstagramUrl('https://www.instagram.com/p/abc')).toBe(true);
    expect(isInstagramUrl('https://m.instagram.com/reel/abc')).toBe(true);
    expect(isInstagramUrl('https://instagram.com/reel/abc/?igsh=1')).toBe(true);
  });
});
