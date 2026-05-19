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
    const extractFrames = mock(async () => []);
    const build = createBundleBuilder({ transcribe, ocr, downloadVideo, extractFrames });
    const b = await build(imagePost);
    expect(b.transcript).toBeUndefined();
    expect(b.ocr).toBeUndefined();           // empty OCR collapses to undefined
    expect(b.caption).toBe('No video here');
    expect(transcribe).not.toHaveBeenCalled();
    expect(ocr).toHaveBeenCalledTimes(1);    // OCR DID run on the one image
    expect(ocr).toHaveBeenCalledWith('i.jpg');
  });
  test('image-only post: OCR text from images is concatenated', async () => {
    const build = createBundleBuilder({
      transcribe: mock(async () => 'should not be called'),
      ocr: mock(async (url: string) => `OCR-of-${url}`),
      downloadVideo: mock(async () => 'unused'),
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
    expect(b.ocr).toContain('[image 1] OCR-of-a.jpg');
    expect(b.ocr).toContain('[image 2] OCR-of-b.jpg');
  });
  test('parses hashtags and @mentions', async () => {
    const build = createBundleBuilder({
      transcribe: mock(async () => ''),
      ocr: mock(async () => ''),
      downloadVideo: mock(async () => '/tmp/v.mp4'),
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
    const extractFrames = mock(async () => ['/tmp/f1.jpg', '/tmp/f2.jpg', '/tmp/f3.jpg']);
    const build = createBundleBuilder({ transcribe, ocr, downloadVideo, extractFrames });
    const b = await build(videoPost);
    expect(b.transcript).toBe('TRANSCRIPT');
    expect(b.ocr).toContain('OCR(f1.jpg)');
    expect(b.ocr).toContain('OCR(f3.jpg)');
    expect(ocr).toHaveBeenCalledTimes(3);
  });
  test('includes locationTagName when present', async () => {
    const build = createBundleBuilder({
      transcribe: mock(async () => ''),
      ocr: mock(async () => ''),
      downloadVideo: mock(async () => '/tmp/v.mp4'),
      extractFrames: mock(async () => []),
    });
    const b = await build({ ...videoPost, locationTag: { name: 'Cafe Onion' } });
    expect(b.locationTagName).toBe('Cafe Onion');
  });
});
