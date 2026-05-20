import Groq from 'groq-sdk';
import { config } from '../config';
import { createSupabaseClient } from './supabase';
import { createQueue } from './queue';
import { createFetchPost } from './fetchPost';
import { createTranscriber, BIAS_PROMPT } from './transcribe';
import { createGeminiExtractor, createGeminiVideoAnalyzer, createGeminiVideoTranscriber } from './gemini';
import { createFrameExtractor } from './extractFrames';
import { createOcr } from './ocr';
import { createBundleBuilder } from './buildBundle';
import { createExtractor } from './extractPlaces';
import { ENODEVBROWSER } from './types';
import { createGeocoder, realGoogleLookup, realKakaoLookup } from './geocode';
import { upsertPostFactory, createSavePlaces } from './savePlaces';
import { createProcessor } from './process';
import { createWorkerLoop } from './worker';
import { createCommentsFetcher } from './fetchComments';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';

// Instagram's CDN throttles or 403s fetches with an empty / generic UA.
// Pretending to be a recent Chrome on macOS keeps the download fast + reliable.
const CDN_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.instagram.com/',
};

async function downloadVideo(url: string, signal?: AbortSignal): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-video-'));
  const out = join(dir, 'video.mp4');
  const r = await fetch(url, { signal, headers: CDN_FETCH_HEADERS });
  if (!r.ok || !r.body) throw new Error(`video download ${r.status}`);
  await Bun.write(out, r);
  return out;
}

async function downloadImage(url: string, signal?: AbortSignal): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-image-'));
  const out = join(dir, 'image.jpg');
  const r = await fetch(url, { signal, headers: CDN_FETCH_HEADERS });
  if (!r.ok || !r.body) throw new Error(`image download ${r.status}`);
  await Bun.write(out, r);
  return out;
}

/**
 * Cached `which yt-dlp` result. Probed once at boot. If the binary isn't on
 * PATH (operator hasn't installed it on the VPS), every job would otherwise
 * waste a Bun.spawn attempt before falling back to direct fetch — and that
 * exception log noise made the real error invisible.
 */
// Cache of `<cmd> --version` probes so we only spawn each binary once per
// process. Concurrent first-callers may both race the spawn; the call is
// idempotent so the duplicate work is harmless.
const binaryProbeCache: Record<string, boolean | undefined> = {};

async function probeBinaryOnce(cmd: string, onMiss?: () => void): Promise<boolean> {
  if (binaryProbeCache[cmd] !== undefined) return binaryProbeCache[cmd]!;
  let ok = false;
  try {
    const proc = Bun.spawn([cmd, '--version'], { stdout: 'pipe', stderr: 'ignore' });
    const exit = await proc.exited;
    ok = exit === 0;
  } catch {
    ok = false;
  }
  binaryProbeCache[cmd] = ok;
  if (ok) console.log(`[ig:bundle] ${cmd} available`);
  else onMiss?.();
  return ok;
}

async function probeYtDlpOnce(): Promise<boolean> {
  return probeBinaryOnce('yt-dlp', () => {
    const installHint = process.platform === 'darwin'
      ? '`brew install yt-dlp`'
      : '`apt install yt-dlp` or `pip install yt-dlp`';
    console.warn(
      '[ig:bundle] yt-dlp NOT in $PATH. Video downloads will use direct CDN ' +
      'fetch only (slower, often hits the 60s timeout on cloud IPs). Install ' +
      `with: ${installHint}. If already installed, make sure the bun process's ` +
      'PATH includes the install dir (e.g. /opt/homebrew/bin on Apple Silicon).'
    );
  });
}

/**
 * Fallback video download via yt-dlp using the canonical IG post URL. yt-dlp
 * handles Instagram CDN signing / cookies that raw `fetch` doesn't, and often
 * succeeds when the direct CDN URL throttles. Takes the IG post URL (not the
 * signed CDN URL), since yt-dlp re-resolves the media URL itself.
 *
 * Throws an `ENOYTDLP` Error if yt-dlp isn't installed — callers can skip the
 * download attempt entirely on subsequent jobs.
 */
async function downloadVideoYtDlp(igUrl: string, signal?: AbortSignal): Promise<string> {
  if (!(await probeYtDlpOnce())) {
    throw new Error('ENOYTDLP: yt-dlp not installed on server');
  }
  const dir = await mkdtemp(join(tmpdir(), 'ig-video-ytdlp-'));
  const out = join(dir, 'video.%(ext)s');
  // Flags target IG rate-limiting from VPS IPs. throttled-rate 50K re-extracts
  // if the CDN throttles us below 50 KB/s (otherwise returns a corrupt file).
  // YT_DLP_COOKIES_FILE: optional Netscape cookies.txt — single biggest VPS
  // reliability bump, but ToS-sensitive, so opt-in.
  const cookiesFile = process.env.YT_DLP_COOKIES_FILE;
  const args = [
    'yt-dlp',
    '-f', 'best[ext=mp4]/best',
    '-o', out,
    '--no-warnings', '--quiet', '--no-playlist',
    '--socket-timeout', '30',
    '--extractor-retries', '5',
    '--retry-sleep', 'extractor:exp=1:16:2',
    '--sleep-requests', '1',
    '--throttled-rate', '50K',
    ...(cookiesFile ? ['--cookies', cookiesFile] : []),
    igUrl,
  ];
  const proc = Bun.spawn(args, { stdout: 'ignore', stderr: 'pipe' });
  const onAbort = () => { try { proc.kill(); } catch {} };
  signal?.addEventListener('abort', onAbort);
  try {
    const code = await proc.exited;
    if (signal?.aborted) throw new Error('yt-dlp aborted');
    if (code !== 0) {
      let err = '';
      try { err = await new Response(proc.stderr as ReadableStream<Uint8Array>).text(); } catch {}
      throw new Error(`yt-dlp exit ${code}: ${err.slice(0, 200)}`);
    }
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(dir)).filter(f => f.startsWith('video.'));
    if (!files.length) throw new Error('yt-dlp produced no output file');
    return join(dir, files[0]);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Headless-browser video downloader: drives `dev-browser` (Playwright under
 * the hood) at Instagram's embed iframe URL —
 * `https://www.instagram.com/p/SHORTCODE/embed/` — and extracts the
 * `<video src>` from the rendered DOM, then streams the CDN URL to disk.
 *
 * Why the embed URL: the canonical /p/ and /reel/ pages serve a login wall
 * to datacenter IPs. The embed iframe (intended for third-party blogs)
 * renders the actual video tag without authentication for video posts.
 *
 * Requires `dev-browser` on the server's PATH. Install once:
 *   npm install -g dev-browser && dev-browser install
 *
 * Memory footprint: ~190-220 MB RSS for the headless Chromium shell.
 * The browser daemon persists between calls so subsequent fetches reuse
 * the existing process (~8-15s warm vs ~20-35s cold).
 *
 * Throws ENODEVBROWSER if dev-browser isn't on PATH so the chain can
 * skip cleanly. Surfaces LOGIN_WALL when IG intercepts the embed for
 * the datacenter IP — when that starts happening, the chain should
 * fall through (eventually we'd need a residential proxy here).
 */
async function downloadVideoHeadless(igUrl: string, signal?: AbortSignal): Promise<string> {
  if (!(await probeDevBrowserOnce())) {
    throw new Error(`${ENODEVBROWSER}: dev-browser not installed on server`);
  }
  const shortcode = igUrl.match(/\/(p|reel|tv)\/([^/?#]+)/)?.[2];
  if (!shortcode) throw new Error(`headless: cannot parse shortcode from ${igUrl}`);

  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
  const scriptDir = await mkdtemp(join(tmpdir(), 'ig-headless-script-'));
  const scriptPath = join(scriptDir, 'extract.js');
  // domcontentloaded (vs networkidle): IG's embed page keeps the network
  // busy with tracking pixels well after the <video src> is rendered; waiting
  // for idle adds 5-10s of dead time. The video tag is in the server-rendered
  // HTML; the JS-fallback regex covers the rare JS-rendered case.
  const script = `
const page = await browser.newPage()
try {
  await page.goto(${JSON.stringify(embedUrl)}, { waitUntil: 'domcontentloaded', timeout: 25000 })
  const result = await page.evaluate(() => {
    if (document.querySelector('a[href*="login"]')) return { loginWall: true }
    const v = document.querySelector('video')
    const src = v ? (v.getAttribute('src') || v.currentSrc) : null
    if (src) return { src }
    const html = document.documentElement.outerHTML
    const m = html.match(/"video_url":"(https:[^"]+)"/)
    if (m) return { src: m[1].replace(/\\\\u0026/g, '&').replace(/\\\\\\//g, '/') }
    return { src: null }
  })
  if (result.loginWall) console.error('LOGIN_WALL')
  else if (!result.src) console.error('NO_SRC')
  else console.log(result.src)
} catch (err) {
  console.error('NAV_ERR:' + (err && err.message ? err.message : String(err)))
}
`;
  await Bun.write(scriptPath, script);

  const proc = Bun.spawn(
    ['dev-browser', 'run', scriptPath],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const onAbort = () => { try { proc.kill(); } catch {} };
  signal?.addEventListener('abort', onAbort);
  try {
    const code = await proc.exited;
    if (signal?.aborted) throw new Error('headless aborted');
    const stdout = await new Response(proc.stdout as ReadableStream<Uint8Array>).text();
    const stderr = await new Response(proc.stderr as ReadableStream<Uint8Array>).text();

    if (stderr.includes('LOGIN_WALL')) throw new Error('headless: IG login wall intercepted (datacenter IP flagged?)');
    if (stderr.includes('NO_SRC')) throw new Error('headless: no <video src> in embed DOM');
    const navErr = stderr.match(/NAV_ERR:(.+)/)?.[1];
    if (navErr) throw new Error(`headless nav: ${navErr.slice(0, 200)}`);
    if (code !== 0) throw new Error(`headless exit ${code}: ${stderr.slice(0, 200)}`);

    const videoSrc = stdout.trim().split('\n').pop() || '';
    if (!videoSrc.startsWith('http')) throw new Error(`headless: unexpected output: ${videoSrc.slice(0, 80)}`);

    const dir = await mkdtemp(join(tmpdir(), 'ig-video-headless-'));
    const outPath = join(dir, 'video.mp4');
    const dl = await fetch(videoSrc, { signal, headers: CDN_FETCH_HEADERS });
    if (!dl.ok || !dl.body) throw new Error(`headless CDN stream ${dl.status}`);
    await Bun.write(outPath, dl);
    return outPath;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    // Always clean up the script-dir; the video-output dir is tracked
    // separately by buildBundle's trackTmpDir for post-bundling cleanup.
    void rm(scriptDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function probeDevBrowserOnce(): Promise<boolean> {
  return probeBinaryOnce('dev-browser', () => {
    console.warn(
      '[ig:bundle] dev-browser NOT in $PATH. Headless video fallback ' +
      'will be skipped. Install with `npm install -g dev-browser && dev-browser install`.'
    );
  });
}

export function buildWorld() {
  if (!config.supabaseUrl || !config.supabaseServiceKey || !config.groqApiKey) {
    throw new Error('ig-worker: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GROQ_API_KEY');
  }
  const supabase = createSupabaseClient({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey });
  const groq = new Groq({ apiKey: config.groqApiKey });

  const queue = createQueue(supabase);
  const fetchPost = createFetchPost({ brightDataApiKey: config.brightDataApiKey });
  // Gemini fallbacks fire when their primary chain is exhausted. Both are
  // optional — if GEMINI_API_KEY is unset, the deps stay undefined and the
  // primary code paths surface their own failures.
  const geminiVideoTranscriber = config.geminiApiKey
    ? createGeminiVideoTranscriber({ apiKey: config.geminiApiKey })
    : undefined;
  const geminiVideoAnalyzer = config.geminiApiKey
    ? createGeminiVideoAnalyzer({ apiKey: config.geminiApiKey })
    : undefined;
  const geminiExtract = config.geminiApiKey
    ? createGeminiExtractor({ apiKey: config.geminiApiKey })
    : undefined;
  const transcribe = createTranscriber({ groq, geminiVideoTranscriber });
  const extractFrames = createFrameExtractor();
  const ocr = createOcr({ apiKey: config.googleVisionApiKey ?? '' });
  const buildBundle = createBundleBuilder({
    transcribe: (input) => transcribe({ ...input, biasPrompt: BIAS_PROMPT }),
    ocr,
    downloadVideo,
    downloadVideoFallback: downloadVideoYtDlp,
    downloadVideoHeadless,
    downloadImage,
    extractFrames,
    biasPrompt: BIAS_PROMPT,
    geminiVideoAnalyzer,
  });
  const extract = createExtractor({ groq, cerebrasApiKey: config.cerebrasApiKey });
  const geocode = createGeocoder({
    googleLookup: realGoogleLookup(config.googleMapsApiKey ?? ''),
    kakaoLookup:  config.kakaoRestApiKey ? realKakaoLookup(config.kakaoRestApiKey) : async () => null,
  });
  const upsertPost = upsertPostFactory(supabase);
  const savePlaces = createSavePlaces(supabase);
  const fetchComments = createCommentsFetcher({ brightDataApiKey: config.brightDataApiKey });

  const processor = createProcessor({
    fetchPost, upsertPost, buildBundle, extract, geocode, savePlaces,
    fetchComments,
    geminiExtract,
    complete: queue.complete, fail: queue.fail, setStep: queue.setStep, log: queue.log,
  });

  const workerId = `${process.pid}@${hostname()}`;
  const loop = createWorkerLoop({
    claim: queue.claim,
    process: processor,
    reapStale: queue.reapStale,
    concurrency: config.igWorkerConcurrency,
    workerId,
    staleThresholdSec: config.igWorkerStaleSec,
  });

  return { queue, loop, supabase };
}

let booted: ReturnType<typeof buildWorld> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function bootIgWorker() {
  if (!config.igWorkerEnabled) {
    console.log('[ig-worker] disabled by IG_WORKER_ENABLED=false');
    return null;
  }
  if (booted) return booted;
  try {
    booted = buildWorld();
    // Probe binaries at boot so the operator sees missing-tool warnings
    // during start-up rather than after submitting the first job.
    void probeYtDlpOnce();
    void probeDevBrowserOnce();
    pollInterval = setInterval(() => { void booted!.loop.tick(); }, config.igWorkerPollMs);
    console.log(`[ig-worker] started concurrency=${config.igWorkerConcurrency} poll=${config.igWorkerPollMs}ms`);

    const shutdown = async () => {
      if (!booted) return;
      booted.loop.stop();
      if (pollInterval) clearInterval(pollInterval);
      const start = Date.now();
      while (booted.loop.inflight() > 0 && Date.now() - start < 30_000) {
        await new Promise(r => setTimeout(r, 250));
      }
      console.log('[ig-worker] shutdown complete');
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    return booted;
  } catch (err) {
    console.warn('[ig-worker] failed to boot:', err);
    return null;
  }
}

export function getQueue() {
  if (booted) return booted.queue;
  // Lazy build: only the queue is needed (e.g., the worker is disabled but the
  // endpoint still has to enqueue). Reuse the booted instance if buildWorld
  // succeeds so subsequent calls don't rebuild.
  const built = buildWorld();
  booted = built;
  return built.queue;
}

export type ExtractedPlacesOpts = {
  userId: string;
  limit?: number;
  offset?: number;
  category?: string;
  band?: string;
  q?: string;
};

// ── IG place day assignment helpers ───────────────────────────────────────────

/**
 * Returns the sorted list of day numbers (1-12) that this IG place has been
 * assigned to for the given user. Returns [] if none.
 */
export async function listIgPlaceDays(opts: { userId: string; placeId: number }): Promise<number[]> {
  const supabaseUrl = config.supabaseUrl;
  const supabaseServiceKey = config.supabaseServiceKey;
  if (!supabaseUrl || !supabaseServiceKey) return [];

  const { userId, placeId } = opts;
  const params = new URLSearchParams({
    select: 'day_n',
    place_id: `eq.${placeId}`,
    user_id: `eq.${userId}`,
    order: 'day_n.asc',
  });
  const url = `${supabaseUrl}/rest/v1/instagram_place_day_assignments?${params.toString()}`;
  const r = await fetch(url, {
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
  });
  if (!r.ok) return [];
  const rows = await r.json() as Array<{ day_n: number }>;
  return rows.map((row) => row.day_n);
}

/**
 * Atomically replaces the day-assignment set for a place. Passing an empty
 * array removes all assignments. Throws if the place doesn't belong to the user.
 */
export async function setIgPlaceDays(opts: { userId: string; placeId: number; days: number[] }): Promise<void> {
  const supabaseUrl = config.supabaseUrl;
  const supabaseServiceKey = config.supabaseServiceKey;
  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase not configured');

  const { userId, placeId, days } = opts;
  const supabase = createSupabaseClient({ url: supabaseUrl, serviceKey: supabaseServiceKey });
  await supabase.rpc('ig_set_place_days', {
    p_user_id: userId,
    p_place_id: placeId,
    p_days: days,
  });
}

/**
 * Fetches IG places assigned to a specific day_n for a user, joined with
 * their source post data. Returns an array ready for the IgSave shape.
 */
export type IgPlaceForDay = {
  id: number;
  name: string;
  name_romanized: string | null;
  category: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  confidence_band: 'high' | 'medium' | 'low';
  supporting_quote: string | null;
  post: {
    url: string;
    shortcode: string | null;
    owner_username: string | null;
    caption: string | null;
  };
};

export async function listIgPlacesForDay(opts: { userId: string; dayN: number }): Promise<IgPlaceForDay[]> {
  const supabaseUrl = config.supabaseUrl;
  const supabaseServiceKey = config.supabaseServiceKey;
  if (!supabaseUrl || !supabaseServiceKey) return [];

  const { userId, dayN } = opts;
  // Join assignments → places → posts
  const params = new URLSearchParams({
    select: 'place_id,instagram_places!inner(id,name,name_romanized,category,address,lat,lng,confidence_band,supporting_quote,post:instagram_posts!inner(url,shortcode,owner_username,caption))',
    user_id: `eq.${userId}`,
    day_n: `eq.${dayN}`,
  });
  const url = `${supabaseUrl}/rest/v1/instagram_place_day_assignments?${params.toString()}`;
  const r = await fetch(url, {
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
  });
  if (!r.ok) return [];
  const rows = await r.json() as Array<{
    place_id: number;
    instagram_places: {
      id: number;
      name: string;
      name_romanized: string | null;
      category: string;
      address: string | null;
      lat: number | null;
      lng: number | null;
      confidence_band: 'high' | 'medium' | 'low';
      supporting_quote: string | null;
      post: {
        url: string;
        shortcode: string | null;
        owner_username: string | null;
        caption: string | null;
      };
    };
  }>;
  return rows.map((row) => ({
    ...row.instagram_places,
    post: row.instagram_places.post,
  }));
}

export async function listExtractedPlaces(opts: ExtractedPlacesOpts) {
  const supabaseUrl = config.supabaseUrl;
  const supabaseServiceKey = config.supabaseServiceKey;
  if (!supabaseUrl || !supabaseServiceKey) {
    return { places: [], total: 0, hasMore: false };
  }

  const { userId, limit = 50, offset = 0, category, band, q } = opts;

  const params = new URLSearchParams();
  params.set('select', '*,post:instagram_posts(id,url,shortcode,owner_username,caption,fetched_at)');
  params.set('user_id', `eq.${userId}`);
  params.set('status', 'neq.rejected');
  params.set('order', 'created_at.desc');

  if (category) {
    params.set('category', `eq.${encodeURIComponent(category)}`);
  }
  if (band) {
    params.set('confidence_band', `eq.${encodeURIComponent(band)}`);
  }
  if (q) {
    params.set('or', `(name.ilike.*${encodeURIComponent(q)}*,supporting_quote.ilike.*${encodeURIComponent(q)}`+ '*)');
  }

  const url = `${supabaseUrl}/rest/v1/instagram_places?${params.toString()}`;
  const rangeEnd = offset + limit - 1;

  const r = await fetch(url, {
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      'Range-Unit': 'items',
      Range: `${offset}-${rangeEnd}`,
      Prefer: 'count=exact',
    },
  });

  if (!r.ok) {
    return { places: [], total: 0, hasMore: false };
  }

  const places = await r.json() as Array<{ id: number; [key: string]: unknown }>;
  const contentRange = r.headers.get('Content-Range') ?? '';
  // Format: "0-49/123" or "*/0"
  const total = Number(contentRange.split('/')[1] ?? 0) || 0;

  // Fetch day assignments for all returned places in one query.
  let daysByPlaceId: Record<number, number[]> = {};
  if (places.length > 0) {
    const placeIds = places.map((p) => p.id);
    const assignParams = new URLSearchParams({
      select: 'place_id,day_n',
      user_id: `eq.${userId}`,
      place_id: `in.(${placeIds.join(',')})`,
      order: 'day_n.asc',
    });
    const assignUrl = `${supabaseUrl}/rest/v1/instagram_place_day_assignments?${assignParams.toString()}`;
    const assignR = await fetch(assignUrl, {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    });
    if (assignR.ok) {
      const rows = await assignR.json() as Array<{ place_id: number; day_n: number }>;
      for (const row of rows) {
        (daysByPlaceId[row.place_id] ??= []).push(row.day_n);
      }
    }
  }

  return {
    places: places.map((p) => ({ ...p, days: daysByPlaceId[p.id] ?? [] })),
    total,
    hasMore: offset + places.length < total,
  };
}

export async function listJobsForUser(userId: string, limit = 20) {
  const supabaseUrl = config.supabaseUrl;
  const supabaseServiceKey = config.supabaseServiceKey;
  if (!supabaseUrl || !supabaseServiceKey) {
    return [];
  }
  const supabase = createSupabaseClient({ url: supabaseUrl, serviceKey: supabaseServiceKey });

  const jobs = await supabase.select<{
    id: number; url: string; status: string; step: string; step_started_at: string | null;
    attempts: number; last_error: string | null; created_at: string; updated_at: string; post_id: number | null;
  }>('instagram_jobs', {
    eq: { user_id: userId },
    select: 'id,url,status,step,step_started_at,attempts,last_error,created_at,updated_at,post_id',
    order: 'created_at.desc',
    limit,
  });

  const postIds = jobs.map(j => j.post_id).filter((x): x is number => x != null);
  let placesByPost: Record<number, unknown[]> = {};

  if (postIds.length) {
    const url = `${supabaseUrl}/rest/v1/instagram_places?post_id=in.(${postIds.join(',')})` +
      `&select=id,post_id,name,name_romanized,city,category,confidence,confidence_band,` +
      `is_subject,supporting_quote,address,lat,lng,geocode_source,geocode_disagree,` +
      `signal_source,vote_count,geocode_kakao_id`;
    const r = await fetch(url, {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    });
    if (r.ok) {
      const rows = await r.json() as Array<{ post_id: number; [key: string]: unknown }>;
      for (const p of rows) {
        (placesByPost[p.post_id] ??= []).push(p);
      }
    }
  }

  // Fetch a small preview of each post (caption, transcript) so the UI can
  // show users *what* the LLM saw when 0 places were extracted. Cheap query —
  // we already need post_ids for places.
  const postsById: Record<number, { caption: string | null; transcript: string | null; ocr_text: string | null; location_tag: unknown | null }> = {};
  if (postIds.length) {
    const postsUrl = `${supabaseUrl}/rest/v1/instagram_posts?id=in.(${postIds.join(',')})` +
      `&select=id,caption,transcript,ocr_text,location_tag`;
    const r = await fetch(postsUrl, {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    });
    if (r.ok) {
      const rows = await r.json() as Array<{ id: number; caption: string | null; transcript: string | null; ocr_text: string | null; location_tag: unknown | null }>;
      for (const p of rows) postsById[p.id] = p;
    }
  }

  let logsByJob: Record<number, unknown[]> = {};
  const jobIds = jobs.map(j => j.id);
  if (jobIds.length) {
    const logsUrl = `${supabaseUrl}/rest/v1/instagram_job_logs?` +
      `job_id=in.(${jobIds.join(',')})` +
      `&select=id,job_id,step,level,message,created_at` +
      `&order=id.asc&limit=2000`;
    const r = await fetch(logsUrl, {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    });
    if (r.ok) {
      const rows = await r.json() as Array<{ job_id: number; [key: string]: unknown }>;
      for (const l of rows) (logsByJob[l.job_id] ??= []).push(l);
    }
  }

  return jobs.map(j => {
    const post = j.post_id != null ? postsById[j.post_id] : undefined;
    return {
      ...j,
      places: j.post_id != null ? (placesByPost[j.post_id] ?? []) : [],
      logs: logsByJob[j.id] ?? [],
      // Preview the same caption + transcript the LLM saw, so the user can
      // verify what the model was looking at. Instagram caps captions at
      // 2200 chars; transcripts can be long for multi-minute reels, so we
      // still cap transcript previews to keep the polling payload reasonable.
      // (The full transcript is still what the LLM extracted from.)
      post_preview: post ? {
        caption: post.caption ?? null,
        caption_truncated: false,
        transcript: post.transcript ? post.transcript.slice(0, 5000) : null,
        transcript_truncated: !!post.transcript && post.transcript.length > 5000,
        has_ocr: !!post.ocr_text,
        location_tag: post.location_tag,
      } : null,
    };
  });
}
