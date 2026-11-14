import { describe, expect, mock, test } from 'bun:test';
import { normalizeApifyPost, recallComments, rememberComments, tryApify } from './apify';
import { createFetchPost } from './fetchPost';
import { createCommentsFetcher } from './fetchComments';
import { NonRetryableError, RetryableError } from './types';

const reel = {
  type: 'Video',
  shortCode: 'DWZSycqDxgq',
  caption: '@nu_dake 📍 Seongsu-dong, Seoul',
  ownerUsername: 'filmfi.lm',
  locationName: 'Seoul, Korea',
  videoUrl: 'https://cdn.example/v.mp4',
  displayUrl: 'https://cdn.example/poster.jpg',
  latestComments: [
    { id: 'c1', text: 'This is Nudake in Seongsu', ownerUsername: 'a' },
    { id: 'c2', text: '   ' },
  ],
};
const URL_REEL = 'https://www.instagram.com/reel/DWZSycqDxgq/?igsh=x';
const ok = (items: unknown) => mock(async () => new Response(JSON.stringify(items), { status: 200 }));
const noSpawn = () => mock(() => ({ stdout: new Response('').body, stderr: new Response('').body, exited: Promise.resolve(1) }) as never);

describe('Apify post fetcher', () => {
  test('maps a Reel: video with poster, author, location tag, comments', async () => {
    const f = ok([reel]);
    const got = await tryApify(URL_REEL, f as unknown as typeof fetch, 'TOKEN');
    expect(got.payload).toMatchObject({
      shortcode: 'DWZSycqDxgq',
      source: 'apify',
      ownerUsername: 'filmfi.lm',
      caption: reel.caption,
      locationTag: { name: 'Seoul, Korea' },
      mediaItems: [{ type: 'video', url: reel.videoUrl, thumbnail: reel.displayUrl }],
    });
    expect(got.comments).toEqual([{ id: 'c1', text: 'This is Nudake in Seongsu', ownerUsername: 'a', likesCount: undefined, timestamp: undefined, repliesCount: undefined }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/acts/apify~instagram-scraper/run-sync-get-dataset-items');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer TOKEN');
    expect(JSON.parse(String(init.body))).toMatchObject({ directUrls: [URL_REEL], resultsLimit: 1 });
  });

  test('maps a carousel from its child posts, and a photo post from images', () => {
    const carousel = normalizeApifyPost(
      { shortCode: 'C1', childPosts: [{ displayUrl: 'a.jpg' }, { videoUrl: 'b.mp4', displayUrl: 'b.jpg' }] },
      'https://www.instagram.com/p/C1/',
    );
    expect(carousel.mediaItems).toEqual([{ type: 'image', url: 'a.jpg' }, { type: 'video', url: 'b.mp4', thumbnail: 'b.jpg' }]);
    const photo = normalizeApifyPost({ displayUrl: 'a.jpg', images: ['a.jpg', 'c.jpg'] }, 'https://www.instagram.com/p/P1/');
    expect(photo.shortcode).toBe('P1');
    expect(photo.mediaItems.map((m) => m.url)).toEqual(['a.jpg', 'c.jpg']);
  });

  test('says why it failed in a way the queue can act on', async () => {
    const status = (code: number) => mock(async () => new Response('nope', { status: code })) as unknown as typeof fetch;
    expect((await tryApify(URL_REEL, status(401), 'T')).error).toBeInstanceOf(NonRetryableError);
    expect((await tryApify(URL_REEL, status(402), 'T')).error?.message).toContain('monthly credit');
    expect((await tryApify(URL_REEL, status(429), 'T')).error).toBeInstanceOf(RetryableError);
    expect((await tryApify(URL_REEL, status(500), 'T')).error).not.toBeInstanceOf(NonRetryableError);
    const missing = await tryApify(URL_REEL, ok([{ error: 'not_found', errorDescription: 'Post does not exist' }]) as unknown as typeof fetch, 'T');
    expect(missing.error?.message).toContain('post not found');
    expect((await tryApify(URL_REEL, ok([]) as unknown as typeof fetch, 'T')).error?.message).toContain('private or deleted');
    expect((await tryApify(URL_REEL, ok([reel]) as unknown as typeof fetch, undefined)).error?.message).toContain('APIFY_TOKEN missing');
  });
});

describe('fetch order', () => {
  test('Apify first: Bright Data and yt-dlp are not touched when it answers', async () => {
    const spawn = noSpawn();
    const f = mock(async (url: string) => {
      expect(url).toContain('api.apify.com');
      return new Response(JSON.stringify([reel]), { status: 200 });
    });
    const post = await createFetchPost({ spawn, fetch: f as unknown as typeof fetch, apifyToken: 'A', brightDataApiKey: 'B' })(URL_REEL, null);
    expect(post.source).toBe('apify');
    expect(f).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(recallComments(URL_REEL)?.[0]?.text).toContain('Nudake');
  });

  test('falls through to Bright Data, and reports "not found" over a dead key', async () => {
    const f = mock(async (url: string) =>
      url.includes('apify')
        ? new Response(JSON.stringify([{ error: 'not_found' }]), { status: 200 })
        : new Response('Token expired', { status: 401 }),
    );
    const fetchPost = createFetchPost({ spawn: noSpawn(), fetch: f as unknown as typeof fetch, apifyToken: 'A', brightDataApiKey: 'B' });
    await expect(fetchPost(URL_REEL, null)).rejects.toThrow(/post not found/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  test('a transient Apify failure stays retryable when nothing else can fetch', async () => {
    const f = mock(async () => new Response('busy', { status: 503 }));
    const fetchPost = createFetchPost({ spawn: noSpawn(), fetch: f as unknown as typeof fetch, apifyToken: 'A', brightDataApiKey: undefined });
    const err = await fetchPost(URL_REEL, null).catch((e) => e);
    expect(err).not.toBeInstanceOf(NonRetryableError);
  });

  test('with no fetcher configured the reason is explicit', async () => {
    const fetchPost = createFetchPost({ spawn: noSpawn(), fetch: mock(async () => new Response('')) as unknown as typeof fetch, brightDataApiKey: undefined });
    await expect(fetchPost(URL_REEL, null)).rejects.toThrow(/no Instagram fetcher is configured/);
  });
});

describe('comments', () => {
  test('reuses the comments that came with the post, then Apify, then Bright Data', async () => {
    rememberComments('https://www.instagram.com/p/REM1/', [{ id: '1', text: 'remembered comment' }]);
    const never = mock(async () => new Response('[]'));
    const fetcher = createCommentsFetcher({ fetch: never as unknown as typeof fetch, apifyToken: 'A', brightDataApiKey: undefined });
    expect((await fetcher('https://www.instagram.com/p/REM1/'))[0]!.text).toBe('remembered comment');
    expect(never).not.toHaveBeenCalled();

    const viaApify = createCommentsFetcher({ fetch: ok([reel]) as unknown as typeof fetch, apifyToken: 'A', brightDataApiKey: undefined });
    expect((await viaApify('https://www.instagram.com/p/OTHER1/', { limit: 5 })).map((c) => c.id)).toEqual(['c1']);

    const none = createCommentsFetcher({ fetch: ok([]) as unknown as typeof fetch, apifyToken: undefined, brightDataApiKey: undefined });
    expect(await none('https://www.instagram.com/p/OTHER2/')).toEqual([]);
  });
});
