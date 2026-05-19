import { test, expect, describe } from 'bun:test';
import { createCommentsFetcher, renderCommentsForBundle } from './fetchComments';
import type { ApifyComment } from './fetchComments';
import { RetryableError } from './types';

// ---------------------------------------------------------------------------
// createCommentsFetcher
// ---------------------------------------------------------------------------

describe('createCommentsFetcher', () => {
  test('missing token → returns [] without calling fetch', async () => {
    const mockFetch = async () => { throw new Error('should not be called'); };
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, apifyToken: undefined });
    const result = await fetcher('https://www.instagram.com/p/abc/');
    expect(result).toEqual([]);
  });

  test('constructs correct Apify URL and request body', async () => {
    let capturedUrl = '';
    let capturedBody: unknown = null;
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => [] as ApifyComment[],
      } as Response;
    };
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, apifyToken: 'tok123' });
    await fetcher('https://www.instagram.com/p/DX0KioDtDz_/', { limit: 30 });

    expect(capturedUrl).toContain('apify~instagram-comment-scraper');
    expect(capturedUrl).toContain('token=tok123');
    expect(capturedBody).toMatchObject({
      directUrls: ['https://www.instagram.com/p/DX0KioDtDz_/'],
      resultsLimit: 30,
    });
  });

  test('uses default limit of 50 when not specified', async () => {
    let capturedBody: unknown = null;
    const mockFetch = async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return { ok: true, status: 200, json: async () => [] } as Response;
    };
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, apifyToken: 'tok' });
    await fetcher('https://www.instagram.com/p/abc/');
    expect((capturedBody as any).resultsLimit).toBe(50);
  });

  test('HTTP 429 → throws RetryableError with 5 min delay', async () => {
    const mockFetch = async () => ({ ok: false, status: 429 } as Response);
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, apifyToken: 'tok' });
    await expect(fetcher('https://www.instagram.com/p/abc/')).rejects.toBeInstanceOf(RetryableError);
    try {
      await fetcher('https://www.instagram.com/p/abc/');
    } catch (err) {
      expect(err).toBeInstanceOf(RetryableError);
      expect((err as RetryableError).retryAfterMs).toBe(300_000);
    }
  });

  test('non-200, non-429 HTTP error → throws generic Error', async () => {
    const mockFetch = async () => ({ ok: false, status: 500 } as Response);
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, apifyToken: 'tok' });
    await expect(fetcher('https://www.instagram.com/p/abc/')).rejects.toThrow('apify comments 500');
  });

  test('empty array response → returns []', async () => {
    const mockFetch = async () => ({
      ok: true, status: 200, json: async () => [],
    } as Response);
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, apifyToken: 'tok' });
    const result = await fetcher('https://www.instagram.com/p/abc/');
    expect(result).toEqual([]);
  });

  test('non-array response → returns []', async () => {
    const mockFetch = async () => ({
      ok: true, status: 200, json: async () => ({ error: 'unexpected' }),
    } as Response);
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, apifyToken: 'tok' });
    const result = await fetcher('https://www.instagram.com/p/abc/');
    expect(result).toEqual([]);
  });

  test('returns the comments array from Apify', async () => {
    const comments: ApifyComment[] = [
      { id: '1', text: 'Great cafe!', ownerUsername: 'user1', likesCount: 50 },
      { id: '2', text: 'Love it', ownerUsername: 'user2', likesCount: 10 },
    ];
    const mockFetch = async () => ({
      ok: true, status: 200, json: async () => comments,
    } as Response);
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, apifyToken: 'tok' });
    const result = await fetcher('https://www.instagram.com/p/abc/');
    expect(result).toEqual(comments);
  });
});

// ---------------------------------------------------------------------------
// renderCommentsForBundle
// ---------------------------------------------------------------------------

describe('renderCommentsForBundle', () => {
  test('sorts by likesCount descending', () => {
    const comments: ApifyComment[] = [
      { id: '1', text: 'Low likes comment here', ownerUsername: 'a', likesCount: 5 },
      { id: '2', text: 'High likes comment here', ownerUsername: 'b', likesCount: 100 },
      { id: '3', text: 'Medium likes comment here', ownerUsername: 'c', likesCount: 50 },
    ];
    const result = renderCommentsForBundle(comments);
    const lines = result.split('\n');
    expect(lines[0]).toContain('100♥');
    expect(lines[1]).toContain('50♥');
    expect(lines[2]).toContain('5♥');
  });

  test('filters out comments shorter than 6 characters', () => {
    const comments: ApifyComment[] = [
      { id: '1', text: 'hi', ownerUsername: 'a', likesCount: 100 },        // too short
      { id: '2', text: '👏', ownerUsername: 'b', likesCount: 90 },          // too short
      { id: '3', text: 'Nice spot to visit!', ownerUsername: 'c', likesCount: 80 },
    ];
    const result = renderCommentsForBundle(comments);
    expect(result).not.toContain('@a');
    expect(result).not.toContain('@b');
    expect(result).toContain('@c');
  });

  test('filters out pure @-mentions shorter than 30 chars', () => {
    const comments: ApifyComment[] = [
      { id: '1', text: '@friend123', ownerUsername: 'a', likesCount: 100 },  // pure mention, skip
      { id: '2', text: '@friend you must try this place!', ownerUsername: 'b', likesCount: 80 },  // mention but long
      { id: '3', text: 'Food section at the basement of Hyundai dept store (Gangnam) was a solid 10/10 too', ownerUsername: 'c', likesCount: 160 },
    ];
    const result = renderCommentsForBundle(comments);
    const lines = result.split('\n');
    // @a (pure short mention) should be excluded
    expect(result).not.toContain('[100♥ @a]');
    // @b (long mention text) should be included
    expect(result).toContain('@b');
    // @c always included
    expect(result).toContain('@c');
    expect(lines.length).toBe(2);
  });

  test('truncates per-comment text at 200 chars', () => {
    const longText = 'A'.repeat(250);
    const comments: ApifyComment[] = [
      { id: '1', text: longText, ownerUsername: 'user', likesCount: 10 },
    ];
    const result = renderCommentsForBundle(comments);
    // The line contains the 200-char truncated text
    const textPart = result.split('] ')[1];
    expect(textPart?.length).toBeLessThanOrEqual(200);
    expect(textPart).toBe('A'.repeat(200));
  });

  test('caps total output at 2000 chars', () => {
    // Create many comments that would exceed 2000 chars combined
    const comments: ApifyComment[] = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      text: 'This is a comment about a great restaurant in Seoul worth visiting!',
      ownerUsername: `user${i}`,
      likesCount: 100 - i,
    }));
    const result = renderCommentsForBundle(comments);
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  test('respects topN limit', () => {
    const comments: ApifyComment[] = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      text: `Comment number ${i} about a place`,
      ownerUsername: `user${i}`,
      likesCount: 50 - i,
    }));
    const result = renderCommentsForBundle(comments, 5);
    const lines = result.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  test('includes likes count, username, and text in each line', () => {
    const comments: ApifyComment[] = [
      { id: '1', text: 'Food section at Hyundai dept store in Gangnam was amazing!', ownerUsername: 'traveler42', likesCount: 160 },
    ];
    const result = renderCommentsForBundle(comments);
    expect(result).toContain('[160♥ @traveler42]');
    expect(result).toContain('Food section at Hyundai dept store in Gangnam was amazing!');
  });

  test('handles missing likesCount and ownerUsername gracefully', () => {
    const comments: ApifyComment[] = [
      { id: '1', text: 'Some comment about a venue here', ownerUsername: undefined, likesCount: undefined },
    ];
    const result = renderCommentsForBundle(comments);
    expect(result).toContain('[0♥ @?]');
  });

  test('returns empty string when all comments are filtered out', () => {
    const comments: ApifyComment[] = [
      { id: '1', text: 'lol', ownerUsername: 'a', likesCount: 100 },
      { id: '2', text: '@tag', ownerUsername: 'b', likesCount: 90 },
    ];
    const result = renderCommentsForBundle(comments);
    expect(result).toBe('');
  });
});
