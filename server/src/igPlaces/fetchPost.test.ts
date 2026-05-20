import { test, expect, describe, mock } from 'bun:test';
import { createFetchPost } from './fetchPost';
import ytDlpFixture from './__fixtures__/yt-dlp-cafe.json' with { type: 'json' };
import brightDataFixture from './__fixtures__/bright-data-cafe.json' with { type: 'json' };
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

describe('fetchPost (Bright Data is primary)', () => {
  test('Bright Data succeeds → PostPayload w/ source=bright-data; yt-dlp not invoked', async () => {
    const spawn = stubSpawn(ytDlpFixture, 0);
    const fetchPost = createFetchPost({
      spawn,
      fetch: mock(async (url: string, init: RequestInit) => {
        expect(url).toContain('api.brightdata.com/datasets/v3/scrape');
        expect(url).toContain('dataset_id=gd_lk5ns7kz21pck8jpis');
        const auth = new Headers(init.headers).get('Authorization');
        expect(auth).toBe('Bearer TOKEN');
        return new Response(JSON.stringify(brightDataFixture), { status: 200 });
      }),
      brightDataApiKey: 'TOKEN',
    });
    const r = await fetchPost('https://www.instagram.com/reel/ABC123', null);
    expect(r.source).toBe('bright-data');
    expect(r.locationTag?.name).toBe('Cafe Onion Seongsu');
    expect(r.locationTag?.lat).toBe(37.5447);
    expect(r.locationTag?.lng).toBe(127.0556);
    expect(r.mediaItems[0]).toEqual({
      type: 'video',
      url: 'https://scontent.cdninstagram.com/video.mp4',
      thumbnail: 'https://scontent.cdninstagram.com/thumb.jpg',
    });
    expect(r.ownerUsername).toBe('anonfoodie');
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('fetchPost (yt-dlp backup)', () => {
  test('Bright Data key missing → falls through to yt-dlp', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(ytDlpFixture, 0),
      fetch: mock(async () => new Response('should not reach bright-data', { status: 500 })),
      brightDataApiKey: undefined,
    });
    const r = await fetchPost('https://www.instagram.com/reel/ABC123', null);
    expect(r.source).toBe('yt-dlp');
    expect(r.caption).toContain('성수동');
  });

  test('Bright Data 5xx → falls through to yt-dlp', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(ytDlpFixture, 0),
      fetch: mock(async () => new Response('boom', { status: 502 })),
      brightDataApiKey: 'TOKEN',
    });
    const r = await fetchPost('https://www.instagram.com/reel/ABC123', null);
    expect(r.source).toBe('yt-dlp');
  });

  test('Bright Data 429 + yt-dlp also fails → RetryableError', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('rate limited', { status: 429 })),
      brightDataApiKey: 'TOKEN',
    });
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(RetryableError);
  });

  test('Bright Data empty + yt-dlp also fails → NonRetryableError', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('[]', { status: 200 })),
      brightDataApiKey: 'TOKEN',
    });
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(NonRetryableError);
  });

  test('both fail with no specific error → NonRetryableError', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('[]', { status: 200 })),
      brightDataApiKey: 'TOKEN',
    });
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(/bright-data returned empty/);
  });
});
