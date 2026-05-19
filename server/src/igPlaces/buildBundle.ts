import type { ExtractionBundle, PostPayload } from './types';
import { rm, stat } from 'node:fs/promises';
import { dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';

export type BundleLog = (level: 'info'|'warn'|'error', message: string) => Promise<void> | void;

export interface BundleOpts {
  log?: BundleLog;
}

export interface BundleDeps {
  transcribe: (input: { filePath: string; biasPrompt: string; signal?: AbortSignal }) => Promise<string>;
  ocr: (imagePath: string) => Promise<string>;
  downloadVideo: (url: string, signal?: AbortSignal) => Promise<string>;
  downloadImage: (url: string, signal?: AbortSignal) => Promise<string>;
  extractFrames: (videoPath: string, count?: number, signal?: AbortSignal) => Promise<string[]>;
  biasPrompt?: string;
}

export type BundleBuilder = (post: PostPayload, opts?: BundleOpts) => Promise<ExtractionBundle>;

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;
const MENTION_RE = /@([a-zA-Z0-9_.]+)/g;

const TIMEOUT_DOWNLOAD_MS = 60_000;
const TIMEOUT_TRANSCRIBE_MS = 90_000;
const TIMEOUT_FFMPEG_MS = 60_000;
const TIMEOUT_OCR_MS = 20_000;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string, ctrl?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tip = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (ctrl) ctrl.abort();
      reject(new Error(`${label} timed out after ${Math.round(ms/1000)}s`));
    }, ms);
  });
  try {
    return await Promise.race([p, tip]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createBundleBuilder(deps: BundleDeps): BundleBuilder {
  return async function build(post, opts = {}) {
    const log = opts.log ?? (async () => {});
    const hashtags = [...post.caption.matchAll(HASHTAG_RE)].map(m => m[1]);
    const mentions = [...post.caption.matchAll(MENTION_RE)].map(m => m[1]);
    const video = post.mediaItems.find(m => m.type === 'video');
    const images = post.mediaItems.filter(m => m.type === 'image');

    let transcript: string | undefined;
    let ocr: string | undefined;
    const tmpPaths: string[] = [];
    // Only track dirs that are proper subdirectories of tmpdir (mkdtemp-created).
    // Guard against test mocks that return paths directly under a system tmp root
    // (e.g. /tmp/img.jpg) where dirname would be a protected system directory.
    const rootTmp = tmpdir();
    const trackTmpDir = (filePath: string) => {
      const dir = dirname(filePath);
      // Only register dirs that sit inside rootTmp (i.e. actual mkdtemp output).
      if (dir.startsWith(rootTmp + sep)) {
        tmpPaths.push(dir);
      }
    };

    try {
      if (video) {
        // 1. Download video
        const host = (() => { try { return new URL(video.url).hostname; } catch { return video.url.slice(0, 40); } })();
        await log('info', `downloading video from ${host}…`);
        const t0 = Date.now();
        const dlCtrl = new AbortController();
        let localPath: string;
        try {
          localPath = await withTimeout(
            deps.downloadVideo(video.url, dlCtrl.signal),
            TIMEOUT_DOWNLOAD_MS, 'video download', dlCtrl,
          );
          trackTmpDir(localPath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await log('warn', `video download failed: ${msg} — bundle will have no transcript/frames`);
          return { caption: post.caption, transcript, ocr,
                   locationTagName: post.locationTag?.name, hashtags, mentions };
        }
        await log('info', `video saved (${Date.now() - t0}ms)`);

        // 2. Transcribe + frames in parallel, each with its own timeout
        const tCtrl = new AbortController();
        const fCtrl = new AbortController();
        await log('info', 'transcribing audio (Whisper dual-pass) + extracting frames…');
        const t1 = Date.now();
        const [maybeTranscript, frames] = await Promise.all([
          withTimeout(
            deps.transcribe({ filePath: localPath, biasPrompt: deps.biasPrompt ?? '', signal: tCtrl.signal }),
            TIMEOUT_TRANSCRIBE_MS, 'transcribe', tCtrl,
          ).catch(async (err) => {
            await log('warn', `transcribe failed: ${err instanceof Error ? err.message : String(err)}`);
            return '';
          }),
          withTimeout(
            deps.extractFrames(localPath, 5, fCtrl.signal),
            TIMEOUT_FFMPEG_MS, 'extract frames', fCtrl,
          ).then(framePaths => {
            if (framePaths.length) trackTmpDir(framePaths[0]);
            return framePaths;
          }).catch(async (err) => {
            await log('warn', `frame extraction failed: ${err instanceof Error ? err.message : String(err)}`);
            return [] as string[];
          }),
        ]);
        transcript = maybeTranscript || undefined;
        await log('info', `transcript=${transcript ? transcript.length + ' chars' : 'none'}, ${frames.length} frame(s) (${Date.now() - t1}ms)`);

        // 3. OCR each frame
        if (frames.length) {
          await log('info', `OCR\'ing ${frames.length} frame(s)…`);
          const t2 = Date.now();
          const texts = await Promise.all(frames.map((f, i) =>
            withTimeout(deps.ocr(f), TIMEOUT_OCR_MS, 'ocr frame')
              .then(t => t ? `[frame ${i+1}] ${t}` : '')
              .catch(() => '')));
          const joined = texts.filter(Boolean).join('\n');
          if (joined) ocr = joined;
          await log('info', `frame OCR: ${texts.filter(Boolean).length}/${frames.length} had text (${Date.now() - t2}ms)`);
        }
      } else if (images.length) {
        await log('info', `OCR\'ing ${images.length} carousel image(s)…`);
        const t0 = Date.now();
        const texts = await Promise.all(images.map(async (img, i) => {
          const dlCtrl = new AbortController();
          const localPath = await withTimeout(
            deps.downloadImage(img.url, dlCtrl.signal), TIMEOUT_DOWNLOAD_MS, 'image download', dlCtrl,
          ).then(p => { trackTmpDir(p); return p; }).catch(() => null);
          if (!localPath) return '';
          return withTimeout(deps.ocr(localPath), TIMEOUT_OCR_MS, 'ocr image')
            .then(t => t ? `[image ${i+1}] ${t}` : '')
            .catch(() => '');
        }));
        const joined = texts.filter(Boolean).join('\n');
        if (joined) ocr = joined;
        await log('info', `carousel OCR: ${texts.filter(Boolean).length}/${images.length} had text (${Date.now() - t0}ms)`);
      } else {
        await log('info', 'no video or images on post — caption-only bundle');
      }

      return {
        caption: post.caption,
        transcript,
        ocr,
        locationTagName: post.locationTag?.name,
        hashtags,
        mentions,
      };
    } finally {
      if (tmpPaths.length) {
        const uniqueDirs = [...new Set(tmpPaths)];
        let totalBytes = 0;
        for (const dir of uniqueDirs) {
          const size = await stat(dir).then(s => s.size).catch(() => 0);
          totalBytes += size;
        }
        await Promise.all(uniqueDirs.map(dir => rm(dir, { recursive: true, force: true })));
        console.info(`[ig:bundle] cleaned ${uniqueDirs.length} tmp dir(s), ~${totalBytes} bytes`);
      }
    }
  };
}
