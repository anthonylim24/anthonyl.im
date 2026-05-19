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

describe('fetchPost (Apify is primary)', () => {
  test('Apify succeeds → returns PostPayload with source=apify; yt-dlp not invoked', async () => {
    const spawn = stubSpawn(ytDlpFixture, 0);
    const fetchPost = createFetchPost({
      spawn,
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
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('fetchPost (yt-dlp backup)', () => {
  test('Apify token missing → falls through to yt-dlp', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(ytDlpFixture, 0),
      fetch: mock(async () => new Response('should not reach apify', { status: 500 })),
      apifyToken: undefined,
    });
    const r = await fetchPost('https://www.instagram.com/reel/ABC123', null);
    expect(r.source).toBe('yt-dlp');
    expect(r.caption).toContain('성수동');
  });

  test('Apify 5xx → falls through to yt-dlp', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(ytDlpFixture, 0),
      fetch: mock(async () => new Response('boom', { status: 502 })),
      apifyToken: 'TOKEN',
    });
    const r = await fetchPost('https://www.instagram.com/reel/ABC123', null);
    expect(r.source).toBe('yt-dlp');
  });

  test('Apify 429 + yt-dlp also fails → throws RetryableError (Apify error wins)', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('rate limited', { status: 429 })),
      apifyToken: 'TOKEN',
    });
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(RetryableError);
  });

  test('Apify empty + yt-dlp also fails → throws NonRetryableError', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('[]', { status: 200 })),
      apifyToken: 'TOKEN',
    });
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(NonRetryableError);
  });

  test('Both fail with no specific error → NonRetryableError', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('[]', { status: 200 })),
      apifyToken: 'TOKEN',
    });
    // Apify empty (NonRetryableError); yt-dlp fails. The Apify error surfaces.
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(/apify returned empty/);
  });
});
