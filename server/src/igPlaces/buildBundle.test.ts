import { test, expect, describe, mock } from 'bun:test';
import { createBundleBuilder } from './buildBundle';
import type { PostPayload } from './types';

const imagePost: PostPayload = {
  shortcode: 'A', caption: 'No video here', mediaItems: [{ type: 'image', url: 'i.jpg' }],
  source: 'bright-data', raw: {},
};

const videoPost: PostPayload = {
  shortcode: 'A', caption: 'Caption with #tag and @owner',
  mediaItems: [{ type: 'video', url: 'v.mp4', thumbnail: 't.jpg' }],
  source: 'bright-data', raw: {},
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

  test('video fallback: returns caption-only if both yt-dlp and CDN fail', async () => {
    const downloadVideoFallback = mock(async () => { throw new Error('yt-dlp failed'); });
    const downloadVideo = mock(async () => { throw new Error('CDN failed'); });
    const transcribe = mock(async () => 'should not be called');
    const build = createBundleBuilder({
      transcribe,
      ocr: mock(async () => ''),
      downloadVideo,
      downloadVideoFallback,
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames: mock(async () => []),
    });
    const postWithUrl = { ...videoPost, url: 'https://www.instagram.com/p/abc/' };
    const b = await build(postWithUrl);
    expect(b.caption).toBe('Caption with #tag and @owner');
    expect(b.transcript).toBeUndefined();
    expect(transcribe).not.toHaveBeenCalled();
  });

  test('CDN fallback invoked when yt-dlp fails', async () => {
    const downloadVideoFallback = mock(async () => { throw new Error('yt-dlp failed'); });
    const downloadVideo = mock(async () => '/tmp/cdn/video.mp4');
    const transcribe = mock(async () => 'CDN_TRANSCRIPT');
    const build = createBundleBuilder({
      transcribe,
      ocr: mock(async () => ''),
      downloadVideo,
      downloadVideoFallback,
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames: mock(async () => []),
    });
    const postWithUrl = { ...videoPost, url: 'https://www.instagram.com/p/abc/' };
    const b = await build(postWithUrl);
    expect(downloadVideo).toHaveBeenCalled();
    expect(b.transcript).toBe('CDN_TRANSCRIPT');
  });

  test('headless fallback invoked when both yt-dlp and CDN fail', async () => {
    const downloadVideoFallback = mock(async () => { throw new Error('yt-dlp rate-limited'); });
    const downloadVideo = mock(async () => { throw new Error('CDN URL expired'); });
    const downloadVideoHeadless = mock(async () => '/tmp/headless/video.mp4');
    const transcribe = mock(async () => 'HEADLESS_TRANSCRIPT');
    const build = createBundleBuilder({
      transcribe,
      ocr: mock(async () => ''),
      downloadVideo,
      downloadVideoFallback,
      downloadVideoHeadless,
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames: mock(async () => []),
    });
    const postWithUrl = { ...videoPost, url: 'https://www.instagram.com/p/abc/' };
    const b = await build(postWithUrl);
    expect(downloadVideoHeadless).toHaveBeenCalledWith(
      'https://www.instagram.com/p/abc/',
      expect.anything(),
    );
    expect(b.transcript).toBe('HEADLESS_TRANSCRIPT');
  });

  test('all three downloaders fail → caption-only bundle, no crash', async () => {
    const build = createBundleBuilder({
      transcribe: mock(async () => 'should not be called'),
      ocr: mock(async () => ''),
      downloadVideo: mock(async () => { throw new Error('CDN failed'); }),
      downloadVideoFallback: mock(async () => { throw new Error('yt-dlp failed'); }),
      downloadVideoHeadless: mock(async () => { throw new Error('headless failed'); }),
      downloadImage: mock(async () => '/tmp/img.jpg'),
      extractFrames: mock(async () => []),
    });
    const postWithUrl = { ...videoPost, url: 'https://www.instagram.com/p/abc/' };
    const b = await build(postWithUrl);
    expect(b.caption).toBe('Caption with #tag and @owner');
    expect(b.transcript).toBeUndefined();
  });

  test('carousel: Gemini analyzer is the primary path; OCR + preExtractedPlaces flow through', async () => {
    const ocr = mock(async () => 'SHOULD NOT BE CALLED');
    const downloadImage = mock(async (url: string) => `/tmp/${url}`);
    const geminiCarouselAnalyzer = mock(async () => ({
      ocrText: '[slide 1] Cafe Onion Seongsu\n[slide 2] Layered Songridan',
      places: [
        {
          name: 'Cafe Onion Seongsu', name_romanized: '어니언 성수', city: 'Seoul',
          address: null, category: 'cafe' as const, confidence: 0.92, is_subject: true,
          supporting_quote: 'Cafe Onion Seongsu', signal_source: 'ocr' as const,
          vote_count: 1, confidence_band: 'high' as const,
        },
      ],
    }));
    const build = createBundleBuilder({
      transcribe: mock(async () => 'unused'),
      ocr,
      downloadVideo: mock(async () => 'unused'),
      downloadImage,
      extractFrames: mock(async () => []),
      geminiCarouselAnalyzer,
    });
    const carouselPost = {
      ...imagePost,
      mediaItems: [
        { type: 'image' as const, url: 'a.jpg' },
        { type: 'image' as const, url: 'b.jpg' },
      ],
    };
    const b = await build(carouselPost);
    expect(geminiCarouselAnalyzer).toHaveBeenCalledTimes(1);
    expect((geminiCarouselAnalyzer.mock.calls[0] as any[])[1]).toEqual(['/tmp/a.jpg', '/tmp/b.jpg']);
    expect(b.ocr).toContain('Cafe Onion Seongsu');
    expect(b.preExtractedPlaces).toBeDefined();
    expect(b.preExtractedPlaces).toHaveLength(1);
    expect(b.preExtractedPlaces![0].name).toBe('Cafe Onion Seongsu');
    expect(ocr).not.toHaveBeenCalled();
  });

  test('carousel: Gemini analyzer failure falls back to per-image Vision OCR', async () => {
    const downloadImage = mock(async (url: string) => `/tmp/${url}`);
    const ocr = mock(async (p: string) => `OCR-of-${p.replace('/tmp/', '')}`);
    const geminiCarouselAnalyzer = mock(async () => {
      throw new Error('Gemini quota exceeded');
    });
    const build = createBundleBuilder({
      transcribe: mock(async () => 'unused'),
      ocr,
      downloadVideo: mock(async () => 'unused'),
      downloadImage,
      extractFrames: mock(async () => []),
      geminiCarouselAnalyzer,
    });
    const carouselPost = {
      ...imagePost,
      mediaItems: [
        { type: 'image' as const, url: 'a.jpg' },
        { type: 'image' as const, url: 'b.jpg' },
      ],
    };
    const b = await build(carouselPost);
    expect(geminiCarouselAnalyzer).toHaveBeenCalledTimes(1);
    expect(ocr).toHaveBeenCalledTimes(2);
    expect(b.ocr).toContain('[image 1] OCR-of-a.jpg');
    expect(b.ocr).toContain('[image 2] OCR-of-b.jpg');
    expect(b.preExtractedPlaces).toBeUndefined();
  });

  test('skipVideo: skips entire video/image pipeline; returns caption + locationTag only', async () => {
    const downloadVideo = mock(async () => '/tmp/v.mp4');
    const downloadVideoFallback = mock(async () => '/tmp/v-yt.mp4');
    const transcribe = mock(async () => 'should not be called');
    const ocr = mock(async () => 'should not be called');
    const extractFrames = mock(async () => ['/tmp/f1.jpg']);
    const downloadImage = mock(async () => '/tmp/img.jpg');
    const build = createBundleBuilder({
      transcribe, ocr, downloadVideo, downloadVideoFallback,
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
    expect(transcribe).not.toHaveBeenCalled();
    expect(extractFrames).not.toHaveBeenCalled();
  });
});
