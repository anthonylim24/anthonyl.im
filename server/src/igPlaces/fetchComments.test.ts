import { test, expect, describe } from 'bun:test';
import { createCommentsFetcher, renderCommentsForBundle } from './fetchComments';
import type { IgComment } from './fetchComments';
import { RetryableError } from './types';

// ---------------------------------------------------------------------------
// createCommentsFetcher
// ---------------------------------------------------------------------------

describe('createCommentsFetcher', () => {
  test('missing API key → returns [] without calling fetch', async () => {
    const mockFetch = async () => { throw new Error('should not be called'); };
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, brightDataApiKey: undefined });
    const result = await fetcher('https://www.instagram.com/p/abc/');
    expect(result).toEqual([]);
  });

  test('constructs correct Bright Data URL, headers, and body', async () => {
    let capturedUrl = '';
    let capturedAuth = '';
    let capturedBody: unknown = null;
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedAuth = new Headers(init?.headers).get('Authorization') ?? '';
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify([]), { status: 200 });
    };
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, brightDataApiKey: 'tok123' });
    await fetcher('https://www.instagram.com/p/DX0KioDtDz_/', { limit: 30 });

    expect(capturedUrl).toContain('api.brightdata.com/datasets/v3/scrape');
    expect(capturedUrl).toContain('dataset_id=gd_ltppn085pokosxh13');
    expect(capturedAuth).toBe('Bearer tok123');
    expect(capturedBody).toEqual([{ url: 'https://www.instagram.com/p/DX0KioDtDz_/' }]);
  });

  test('HTTP 429 → throws RetryableError with 5 min delay', async () => {
    const mockFetch = async () => new Response('rate limited', { status: 429 });
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, brightDataApiKey: 'tok' });
    try {
      await fetcher('https://www.instagram.com/p/abc/');
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RetryableError);
      expect((err as RetryableError).retryAfterMs).toBe(300_000);
    }
  });

  test('non-200, non-429 HTTP error → throws generic Error', async () => {
    const mockFetch = async () => new Response('boom', { status: 500 });
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, brightDataApiKey: 'tok' });
    await expect(fetcher('https://www.instagram.com/p/abc/')).rejects.toThrow(/bright-data comments 500/);
  });

  test('empty array response → returns []', async () => {
    const mockFetch = async () => new Response(JSON.stringify([]), { status: 200 });
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, brightDataApiKey: 'tok' });
    const result = await fetcher('https://www.instagram.com/p/abc/');
    expect(result).toEqual([]);
  });

  test('non-array response → returns []', async () => {
    const mockFetch = async () => new Response(JSON.stringify({ error: 'x' }), { status: 200 });
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, brightDataApiKey: 'tok' });
    const result = await fetcher('https://www.instagram.com/p/abc/');
    expect(result).toEqual([]);
  });

  test('normalizes Bright Data fields into IgComment', async () => {
    const brightDataItems = [
      {
        comment_id: 'cid1', comment: 'Great cafe!', comment_user: 'user1',
        likes_number: 50, replies_number: 2, comment_date: '2026-01-01T00:00:00Z',
      },
      {
        comment_id: 'cid2', comment: 'Love it', comment_user: 'user2',
        likes_number: 10, replies_number: 0,
      },
    ];
    const mockFetch = async () => new Response(JSON.stringify(brightDataItems), { status: 200 });
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, brightDataApiKey: 'tok' });
    const result = await fetcher('https://www.instagram.com/p/abc/');
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({
      id: 'cid1', text: 'Great cafe!', ownerUsername: 'user1',
      likesCount: 50, repliesCount: 2, timestamp: '2026-01-01T00:00:00Z',
    });
    expect(result[1].ownerUsername).toBe('user2');
  });

  test('client-side limit caps the returned slice', async () => {
    const brightDataItems = Array.from({ length: 20 }, (_, i) => ({
      comment_id: `c${i}`, comment: `c${i}`, comment_user: `u${i}`, likes_number: i,
    }));
    const mockFetch = async () => new Response(JSON.stringify(brightDataItems), { status: 200 });
    const fetcher = createCommentsFetcher({ fetch: mockFetch as any, brightDataApiKey: 'tok' });
    const result = await fetcher('https://www.instagram.com/p/abc/', { limit: 5 });
    expect(result.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// renderCommentsForBundle
// ---------------------------------------------------------------------------

describe('renderCommentsForBundle', () => {
  test('sorts by likesCount descending', () => {
    const comments: IgComment[] = [
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
    const comments: IgComment[] = [
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
    const comments: IgComment[] = [
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
    const comments: IgComment[] = [
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
    const comments: IgComment[] = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      text: 'This is a comment about a great restaurant in Seoul worth visiting!',
      ownerUsername: `user${i}`,
      likesCount: 100 - i,
    }));
    const result = renderCommentsForBundle(comments);
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  test('respects topN limit', () => {
    const comments: IgComment[] = Array.from({ length: 50 }, (_, i) => ({
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
    const comments: IgComment[] = [
      { id: '1', text: 'Food section at Hyundai dept store in Gangnam was amazing!', ownerUsername: 'traveler42', likesCount: 160 },
    ];
    const result = renderCommentsForBundle(comments);
    expect(result).toContain('[160♥ @traveler42]');
    expect(result).toContain('Food section at Hyundai dept store in Gangnam was amazing!');
  });

  test('handles missing likesCount and ownerUsername gracefully', () => {
    const comments: IgComment[] = [
      { id: '1', text: 'Some comment about a venue here', ownerUsername: undefined, likesCount: undefined },
    ];
    const result = renderCommentsForBundle(comments);
    expect(result).toContain('[0♥ @?]');
  });

  test('returns empty string when all comments are filtered out', () => {
    const comments: IgComment[] = [
      { id: '1', text: 'lol', ownerUsername: 'a', likesCount: 100 },
      { id: '2', text: '@tag', ownerUsername: 'b', likesCount: 90 },
    ];
    const result = renderCommentsForBundle(comments);
    expect(result).toBe('');
  });
});
