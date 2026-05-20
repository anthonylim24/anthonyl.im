import { test, expect, describe, mock } from 'bun:test';
import { createBundleBuilder } from './buildBundle';
import type { PostPayload } from './types';

const imagePost: PostPayload = {
  shortcode: 'A', caption: 'No video here', mediaItems: [{ type: 'image', url: 'i.jpg' }],
  source: 'apify', raw: {},
};

const videoPost: PostPayload = {
  shortcode: 'A', caption: 'Caption with #tag and @owner',
  mediaItems: [{ type: 'video', url: 'v.mp4', thumbnail: 't.jpg' }],
  source: 'apify', raw: {},
};

describe('buildBundle', () => {
  test('image-only post: no transcript, no frames; OCR runs on each image', async () => {
    const transcribe = mock(async () => 'should not be called');
    const ocr = mock(async () => '');  // returns empty so b.ocr stays undefined
    const downloadVideo = mock(async () => 'unused');
    const downloadImage = mock(async () => '/tmp/img.jpg');
    const extractFrames = mock(async () => []);
    const build = createBundleBuilder({ transcribe, ocr, downloadVideo, downloadImage, extractFrames });
    const b = await build(imagePost);
    expect(b.transcript).toBeUndefined();
    expect(b.ocr).toBeUndefined();           // empty OCR collapses to undefined
    expect(b.caption).toBe('No video here');
    expect(transcribe).not.toHaveBeenCalled();
    expect(downloadImage).toHaveBeenCalledTimes(1);
    expect((downloadImage.mock.calls[0] as any[])[0]).toBe('i.jpg');
    expect(ocr).toHaveBeenCalledTimes(1);    // OCR DID run on the one image
    expect(ocr).toHaveBeenCalledWith('/tmp/img.jpg');
  });
  test('image-only post: OCR text from images is concatenated', async () => {
    const downloadImage = mock(async (url: string) => `/tmp/${url}`);
    const ocr = mock(async (path: string) => `OCR-of-${path.replace('/tmp/', '')}`);
    const build = createBundleBuilder({
      transcribe: mock(async () => 'should not be called'),
      ocr,
      downloadVideo: mock(async () => 'unused'),
      downloadImage,
      extractFrames: mock(async () => []),
    });
    const carouselPost = {
      ...imagePost,
      mediaItems: [
        { type: 'image' as const, url: 'a.jpg' },
        { type: 'image' as const, url: 'b.jpg' },
      ],
    };
    const b = await build(carouselPost);
    expect(downloadImage).toHaveBeenCalledTimes(2);
    expect((downloadImage.mock.calls[0] as any[])[0]).toBe('a.jpg');
    expect((downloadImage.mock.calls[1] as any[])[0]).toBe('b.jpg');
    expect(ocr).toHaveBeenCalledWith('/tmp/a.jpg');
    expect(ocr).toHaveBeenCalledWith('/tmp/b.jpg');
    expect(b.ocr).toContain('[image 1] OCR-of-a.jpg');
    expect(b.ocr).toContain('[image 2] OCR-of-b.jpg');
  });
  test('parses hashtags and @mentions', async () => {
    const build = createBundleBuilder({
      transcribe: mock(async () => ''),
      ocr: mock(async () => ''),
      downloadVideo: mock(async () => '/tmp/v.mp4'),
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames: mock(async () => ['/tmp/f1.jpg']),
    });
    const b = await build(videoPost);
    expect(b.hashtags).toEqual(['tag']);
    expect(b.mentions).toEqual(['owner']);
  });
  test('video post: transcribes + ocr on all extracted frames', async () => {
    const transcribe = mock(async () => 'TRANSCRIPT');
    const ocr = mock(async (p: string) => `OCR(${p.split('/').pop()})`);
    const downloadVideo = mock(async () => '/tmp/v.mp4');
    const downloadImage = mock(async () => '/tmp/img.jpg');
    const extractFrames = mock(async () => ['/tmp/f1.jpg', '/tmp/f2.jpg', '/tmp/f3.jpg']);
    const build = createBundleBuilder({ transcribe, ocr, downloadVideo, downloadImage, extractFrames });
    const b = await build(videoPost);
    expect(b.transcript).toBe('TRANSCRIPT');
    expect(b.ocr).toContain('OCR(f1.jpg)');
    expect(b.ocr).toContain('OCR(f3.jpg)');
    expect(ocr).toHaveBeenCalledTimes(3);
    expect(downloadImage).not.toHaveBeenCalled(); // video path, not image path
  });
  test('includes locationTagName when present', async () => {
    const build = createBundleBuilder({
      transcribe: mock(async () => ''),
      ocr: mock(async () => ''),
      downloadVideo: mock(async () => '/tmp/v.mp4'),
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames: mock(async () => []),
    });
    const b = await build({ ...videoPost, locationTag: { name: 'Cafe Onion' } });
    expect(b.locationTagName).toBe('Cafe Onion');
  });

  test('Apify reel-scraper is tried as 2nd path (after yt-dlp, before CDN)', async () => {
    const downloadVideoFallback = mock(async () => { throw new Error('yt-dlp failed'); });
    const downloadVideoApifyReel = mock(async () => '/tmp/apify-reel/video.mp4');
    const downloadVideo = mock(async () => '/tmp/cdn/video.mp4');
    const downloadVideoApify = mock(async () => '/tmp/apify/video.mp4');
    const transcribe = mock(async () => 'REEL_TRANSCRIPT');
    const build = createBundleBuilder({
      transcribe,
      ocr: mock(async () => ''),
      downloadVideo,
      downloadVideoFallback,
      downloadVideoApifyReel,
      downloadVideoApify,
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames: mock(async () => []),
    });
    const postWithUrl = { ...videoPost, url: 'https://www.instagram.com/reel/abc/' };
    const b = await build(postWithUrl);
    expect(downloadVideoApifyReel).toHaveBeenCalledWith(
      'https://www.instagram.com/reel/abc/',
      expect.anything(),
    );
    // CDN and Apify-fresh should NOT be called once reel-scraper succeeds.
    expect(downloadVideo).not.toHaveBeenCalled();
    expect(downloadVideoApify).not.toHaveBeenCalled();
    expect(b.transcript).toBe('REEL_TRANSCRIPT');
  });

  test('Apify fresh-URL fallback: invoked when reel-scraper and CDN both fail', async () => {
    const downloadVideoFallback = mock(async () => { throw new Error('yt-dlp failed'); });
    const downloadVideoApifyReel = mock(async () => { throw new Error('apify reel-scraper 400'); });
    const downloadVideo = mock(async () => { throw new Error('CDN failed'); });
    const downloadVideoApify = mock(async () => '/tmp/apify/video.mp4');
    const transcribe = mock(async () => 'APIFY_TRANSCRIPT');
    const ocr = mock(async () => '');
    const extractFrames = mock(async () => []);
    const build = createBundleBuilder({
      transcribe,
      ocr,
      downloadVideo,
      downloadVideoFallback,
      downloadVideoApifyReel,
      downloadVideoApify,
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames,
    });
    const postWithUrl = { ...videoPost, url: 'https://www.instagram.com/p/abc/' };
    const b = await build(postWithUrl);
    expect(downloadVideoApify).toHaveBeenCalledWith(
      'https://www.instagram.com/p/abc/',
      expect.anything(),
    );
    expect(b.transcript).toBe('APIFY_TRANSCRIPT');
  });

  test('Apify video fallback: not invoked if dep is absent', async () => {
    const downloadVideoFallback = mock(async () => { throw new Error('yt-dlp failed'); });
    const downloadVideo = mock(async () => { throw new Error('CDN failed'); });
    const transcribe = mock(async () => 'should not be called');
    const build = createBundleBuilder({
      transcribe,
      ocr: mock(async () => ''),
      downloadVideo,
      downloadVideoFallback,
      // no downloadVideoApify
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames: mock(async () => []),
    });
    const postWithUrl = { ...videoPost, url: 'https://www.instagram.com/p/abc/' };
    const b = await build(postWithUrl);
    // Should return caption-only bundle since all downloaders failed
    expect(b.caption).toBe('Caption with #tag and @owner');
    expect(b.transcript).toBeUndefined();
    expect(transcribe).not.toHaveBeenCalled();
  });

  test('Apify video fallback: returns caption-only if Apify also fails', async () => {
    const downloadVideoFallback = mock(async () => { throw new Error('yt-dlp failed'); });
    const downloadVideo = mock(async () => { throw new Error('CDN failed'); });
    const downloadVideoApify = mock(async () => { throw new Error('apify failed'); });
    const transcribe = mock(async () => 'should not be called');
    const build = createBundleBuilder({
      transcribe,
      ocr: mock(async () => ''),
      downloadVideo,
      downloadVideoFallback,
      downloadVideoApify,
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames: mock(async () => []),
    });
    const postWithUrl = { ...videoPost, url: 'https://www.instagram.com/p/abc/' };
    const b = await build(postWithUrl);
    expect(b.caption).toBe('Caption with #tag and @owner');
    expect(b.transcript).toBeUndefined();
    expect(transcribe).not.toHaveBeenCalled();
  });

  test('skipVideo: skips entire video/image pipeline; returns caption + locationTag only', async () => {
    const downloadVideo = mock(async () => '/tmp/v.mp4');
    const downloadVideoFallback = mock(async () => '/tmp/v-yt.mp4');
    const downloadVideoApify = mock(async () => '/tmp/v-apify.mp4');
    const transcribe = mock(async () => 'should not be called');
    const ocr = mock(async () => 'should not be called');
    const extractFrames = mock(async () => ['/tmp/f1.jpg']);
    const downloadImage = mock(async () => '/tmp/img.jpg');
    const build = createBundleBuilder({
      transcribe, ocr, downloadVideo, downloadVideoFallback, downloadVideoApify,
      downloadImage, extractFrames,
    });
    const postWithLocation = {
      ...videoPost,
      url: 'https://www.instagram.com/p/abc/',
      locationTag: { name: 'Test Cafe' },
    };
    const b = await build(postWithLocation, { skipVideo: true });
    expect(b.caption).toBe('Caption with #tag and @owner');
    expect(b.locationTagName).toBe('Test Cafe');
    expect(b.transcript).toBeUndefined();
    expect(b.ocr).toBeUndefined();
    expect(downloadVideo).not.toHaveBeenCalled();
    expect(downloadVideoFallback).not.toHaveBeenCalled();
    expect(downloadVideoApify).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(extractFrames).not.toHaveBeenCalled();
  });
});
