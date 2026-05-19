import { test, expect, describe, mock } from 'bun:test';
import { createFetchPost } from './fetchPost';
import ytDlpFixture from './__fixtures__/yt-dlp-cafe.json' with { type: 'json' };
import apifyFixture from './__fixtures__/apify-cafe.json' with { type: 'json' };
import { RetryableError, NonRetryableError } from './types';

function stubSpawn(stdoutJson: object | null, exit: number) {
  return mock((_args: string[], _opts?: object) => {
    const proc: any = {
      stdout: stdoutJson !== null
        ? new Response(JSON.stringify(stdoutJson)).body
        : new Response('').body,
      exited: Promise.resolve(exit),
      stderr: new Response('').body,
    };
    return proc;
  });
}

describe('fetchPost (yt-dlp path)', () => {
  test('yt-dlp succeeds → returns PostPayload with source=yt-dlp', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(ytDlpFixture, 0),
      fetch: mock(async () => new Response('should not be called', { status: 500 })),
      apifyToken: 'TOKEN',
    });
    const r = await fetchPost('https://www.instagram.com/reel/ABC123', null);
    expect(r.source).toBe('yt-dlp');
    expect(r.caption).toContain('성수동');
    expect(r.mediaItems.length).toBeGreaterThan(0);
  });
});

describe('fetchPost (Apify fallback)', () => {
  test('yt-dlp exit≠0 → falls through to Apify', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async (url: string) => {
        expect(url).toContain('apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items');
        return new Response(JSON.stringify(apifyFixture), { status: 200 });
      }),
      apifyToken: 'TOKEN',
    });
    const r = await fetchPost('https://www.instagram.com/reel/ABC123', null);
    expect(r.source).toBe('apify');
    expect(r.locationTag?.name).toBe('Cafe Onion Seongsu');
    expect(r.locationTag?.lat).toBe(37.5447);
  });
  test('Apify 429 throws RetryableError with 5min backoff', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('rate limited', { status: 429 })),
      apifyToken: 'TOKEN',
    });
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(RetryableError);
  });
  test('Apify empty array throws NonRetryableError', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('[]', { status: 200 })),
      apifyToken: 'TOKEN',
    });
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(NonRetryableError);
  });
});
