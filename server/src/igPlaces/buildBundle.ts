import type { ExtractionBundle, PostPayload } from './types';

export interface BundleDeps {
  transcribe: (input: { filePath: string; biasPrompt: string }) => Promise<string>;
  ocr: (imagePath: string) => Promise<string>;
  downloadVideo: (url: string) => Promise<string>;        // returns local path
  downloadImage: (url: string) => Promise<string>;        // returns local path
  extractFrames: (videoPath: string, count?: number) => Promise<string[]>;
  biasPrompt?: string;
}

export type BundleBuilder = (post: PostPayload) => Promise<ExtractionBundle>;

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;
const MENTION_RE = /@([a-zA-Z0-9_.]+)/g;

export function createBundleBuilder(deps: BundleDeps): BundleBuilder {
  return async function build(post) {
    const hashtags = [...post.caption.matchAll(HASHTAG_RE)].map(m => m[1]);
    const mentions = [...post.caption.matchAll(MENTION_RE)].map(m => m[1]);
    const video = post.mediaItems.find(m => m.type === 'video');
    const images = post.mediaItems.filter(m => m.type === 'image');

    let transcript: string | undefined;
    let ocr: string | undefined;

    if (video) {
      const localPath = await deps.downloadVideo(video.url);
      const [maybeTranscript, frames] = await Promise.all([
        deps.transcribe({ filePath: localPath,
                          biasPrompt: deps.biasPrompt ?? '' }).catch(() => ''),
        deps.extractFrames(localPath, 5).catch(() => [] as string[]),
      ]);
      transcript = maybeTranscript || undefined;
      if (frames.length) {
        const texts = await Promise.all(frames.map((f, i) =>
          deps.ocr(f).then(t => t ? `[frame ${i+1}] ${t}` : '').catch(() => '')));
        const joined = texts.filter(Boolean).join('\n');
        if (joined) ocr = joined;
      }
    } else if (images.length) {
      const texts = await Promise.all(images.map(async (img, i) => {
        const localPath = await deps.downloadImage(img.url).catch(() => null);
        if (!localPath) return '';
        return deps.ocr(localPath).then(t => t ? `[image ${i+1}] ${t}` : '').catch(() => '');
      }));
      const joined = texts.filter(Boolean).join('\n');
      if (joined) ocr = joined;
    }

    return {
      caption: post.caption,
      transcript,
      ocr,
      locationTagName: post.locationTag?.name,
      hashtags,
      mentions,
    };
  };
}
