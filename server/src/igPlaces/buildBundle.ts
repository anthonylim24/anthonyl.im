import { ENODEVBROWSER, type ExtractionBundle, type PostPayload } from './types';
import { rm, stat } from 'node:fs/promises';
import { dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';

export type BundleLog = (level: 'info'|'warn'|'error', message: string) => Promise<void> | void;

export interface BundleOpts {
  log?: BundleLog;
  /** When true, skip the entire video/image pipeline (download, transcribe,
   *  frame extraction, OCR). The bundle contains caption + locationTag +
   *  hashtags + mentions only. Cuts job runtime from ~90s to ~10s. */
  skipVideo?: boolean;
}

export interface BundleDeps {
  transcribe: (input: { filePath: string; biasPrompt: string; signal?: AbortSignal }) => Promise<string>;
  ocr: (imagePath: string) => Promise<string>;
  downloadVideo: (url: string, signal?: AbortSignal) => Promise<string>;
  /** Primary downloader: yt-dlp against the canonical IG post URL. Fast
   *  (3-5s) when not rate-limited from the host's IP. */
  downloadVideoFallback?: (igUrl: string, signal?: AbortSignal) => Promise<string>;
  /** Tertiary downloader: headless-browser extraction of the
   *  `/p/SHORTCODE/embed/` iframe. Bypasses IG's login wall for datacenter
   *  IPs by hitting the embed endpoint (designed for third-party blog
   *  embeds). ~10-30s/fetch, free, ~190 MB RAM. Requires dev-browser on
   *  the server's PATH; skipped cleanly if not installed. */
  downloadVideoHeadless?: (igUrl: string, signal?: AbortSignal) => Promise<string>;
  downloadImage: (url: string, signal?: AbortSignal) => Promise<string>;
  extractFrames: (videoPath: string, count?: number, signal?: AbortSignal) => Promise<string[]>;
  biasPrompt?: string;
  /** PRIMARY video analysis: one-shot Gemini call returning
   *  transcript + OCR text + extracted places (with Maps grounding) in a
   *  single API trip. Skips the Groq Whisper + ffmpeg-frames + Vision OCR
   *  pipeline when it succeeds; that pipeline is the fallback when this
   *  function throws (rate-limit, parse error, content policy, etc.). */
  geminiVideoAnalyzer?: (
    post: PostPayload,
    videoPath: string,
    signal?: AbortSignal,
  ) => Promise<{ transcript: string; ocrText: string; places: import('./types').VotedPlace[] }>;
}

export type BundleBuilder = (post: PostPayload, opts?: BundleOpts) => Promise<ExtractionBundle>;

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;
const MENTION_RE = /@([a-zA-Z0-9_.]+)/g;

const TIMEOUT_DOWNLOAD_MS = 120_000;
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

    // Fast-path: user opted out of the video pipeline entirely.
    if (opts.skipVideo) {
      await log('info', 'video pipeline skipped per user request');
      return {
        caption: post.caption,
        locationTagName: post.locationTag?.name,
        hashtags,
        mentions,
      };
    }

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
        // 1. Download video.
        //
        // Empirically the scraper-supplied CDN URL throttles cloud-IP fetches —
        // we hit the 60s timeout on essentially every reel. yt-dlp resolves
        // its own CDN URL against the canonical IG post and consistently
        // returns the file in 3-5s, so we use it as the primary path when
        // available. Direct `fetch` stays as a fallback for the edge case
        // where the post's canonical URL is unavailable.
        const t0 = Date.now();
        let localPath: string | null = null;

        if (deps.downloadVideoFallback && post.url) {
          await log('info', `downloading video via yt-dlp from ${post.url}…`);
          const ytCtrl = new AbortController();
          try {
            localPath = await withTimeout(
              deps.downloadVideoFallback(post.url, ytCtrl.signal),
              TIMEOUT_DOWNLOAD_MS, 'yt-dlp download', ytCtrl,
            );
            trackTmpDir(localPath);
            await log('info', `video saved via yt-dlp (${Date.now() - t0}ms)`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('ENOYTDLP')) {
              const hint = process.platform === 'darwin'
                ? '`brew install yt-dlp`'
                : '`apt install yt-dlp`';
              await log('warn',
                `yt-dlp not in the server's $PATH — falling back to direct CDN fetch. ` +
                `If already installed (try ${hint}), make sure the bun process's PATH ` +
                'includes the install dir AND restart bun (the yt-dlp probe is cached at boot).');
            } else {
              await log('warn', `yt-dlp download failed: ${msg}; trying direct CDN fetch`);
            }
          }
        }

        if (!localPath) {
          // 2nd path: direct CDN fetch of the videoUrl we already have. Cheap
          // when it hasn't expired yet (IG signs URLs for ~10-30 min).
          const host = (() => { try { return new URL(video.url).hostname; } catch { return video.url.slice(0, 40); } })();
          await log('info', `downloading video from ${host}…`);
          const dlCtrl = new AbortController();
          try {
            localPath = await withTimeout(
              deps.downloadVideo(video.url, dlCtrl.signal),
              TIMEOUT_DOWNLOAD_MS, 'video download', dlCtrl,
            );
            trackTmpDir(localPath);
            await log('info', `video saved via direct fetch (${Date.now() - t0}ms)`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await log('warn', `direct CDN download failed: ${msg}; trying headless extraction…`);
          }
        }

        if (!localPath && deps.downloadVideoHeadless && post.url) {
          // 3rd path: headless-browser extraction of /embed/ iframe.
          // Works anonymously, bypasses datacenter-IP login walls, and
          // pulls a fresh <video src> from the rendered DOM.
          const hlCtrl = new AbortController();
          try {
            localPath = await withTimeout(
              deps.downloadVideoHeadless(post.url, hlCtrl.signal),
              TIMEOUT_DOWNLOAD_MS, 'headless extraction', hlCtrl,
            );
            trackTmpDir(localPath);
            await log('info', `video saved via headless extraction (${Date.now() - t0}ms)`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes(ENODEVBROWSER)) {
              await log('warn',
                `dev-browser not on server PATH — headless fallback skipped. ` +
                'Install once: `npm install -g dev-browser && dev-browser install`');
            } else {
              await log('warn', `headless extraction failed: ${msg} — bundle will have no transcript/frames`);
            }
          }
        }

        if (!localPath) {
          return { caption: post.caption, transcript, ocr,
                   locationTagName: post.locationTag?.name, hashtags, mentions };
        }

        // PRIMARY: Gemini one-shot — uploads the video and returns
        // transcript + OCR + extracted places (with Maps grounding) in a
        // single call. Subsumes the Whisper + frames + Vision OCR chain
        // when it succeeds.
        if (deps.geminiVideoAnalyzer) {
          await log('info', 'analyzing video via Gemini (transcript + OCR + places + Maps grounding)…');
          const gCtrl = new AbortController();
          const tGem = Date.now();
          try {
            const result = await withTimeout(
              deps.geminiVideoAnalyzer(post, localPath, gCtrl.signal),
              TIMEOUT_TRANSCRIBE_MS + TIMEOUT_FFMPEG_MS + TIMEOUT_OCR_MS,
              'Gemini video analyzer', gCtrl,
            );
            await log('info',
              `Gemini analyzer done (${Date.now() - tGem}ms): transcript=${result.transcript.length} chars, ` +
              `ocr=${result.ocrText.length} chars, ${result.places.length} place(s)`);
            return {
              caption: post.caption,
              transcript: result.transcript || undefined,
              ocr: result.ocrText || undefined,
              locationTagName: post.locationTag?.name,
              hashtags,
              mentions,
              preExtractedPlaces: result.places,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await log('warn',
              `Gemini analyzer failed (${msg.slice(0, 120)}); falling back to Whisper + Vision OCR pipeline`);
          }
        }

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
