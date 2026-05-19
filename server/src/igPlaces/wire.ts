import Groq from 'groq-sdk';
import { config } from '../config';
import { createSupabaseClient } from './supabase';
import { createQueue } from './queue';
import { createFetchPost } from './fetchPost';
import { createTranscriber, BIAS_PROMPT } from './transcribe';
import { createFrameExtractor } from './extractFrames';
import { createOcr } from './ocr';
import { createBundleBuilder } from './buildBundle';
import { createExtractor } from './extractPlaces';
import { createGeocoder, realGoogleLookup, realKakaoLookup } from './geocode';
import { upsertPostFactory, createSavePlaces } from './savePlaces';
import { createProcessor } from './process';
import { createWorkerLoop } from './worker';
import { createCommentsFetcher } from './fetchComments';
import { mkdtemp } from 'node:fs/promises';
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
let ytDlpAvailable: boolean | null = null;

async function probeYtDlpOnce(): Promise<boolean> {
  if (ytDlpAvailable !== null) return ytDlpAvailable;
  try {
    const proc = Bun.spawn(['yt-dlp', '--version'], {
      stdout: 'pipe', stderr: 'ignore',
    });
    const exit = await proc.exited;
    ytDlpAvailable = exit === 0;
  } catch {
    ytDlpAvailable = false;
  }
  if (!ytDlpAvailable) {
    const installHint = process.platform === 'darwin'
      ? '`brew install yt-dlp`'
      : '`apt install yt-dlp` or `pip install yt-dlp`';
    console.warn(
      '[ig:bundle] yt-dlp NOT in $PATH. Video downloads will use direct CDN ' +
      'fetch only (slower, often hits the 60s timeout on cloud IPs). Install ' +
      `with: ${installHint}. If already installed, make sure the bun process's ` +
      'PATH includes the install dir (e.g. /opt/homebrew/bin on Apple Silicon).'
    );
  } else {
    console.log('[ig:bundle] yt-dlp available');
  }
  return ytDlpAvailable;
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
  const proc = Bun.spawn(
    ['yt-dlp',
      '-f', 'best[ext=mp4]/best',
      '-o', out,
      '--no-warnings', '--quiet', '--no-playlist',
      '--socket-timeout', '15',
      igUrl,
    ],
    { stdout: 'ignore', stderr: 'pipe' },
  );
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
 * Tertiary video downloader: re-calls `apify/instagram-scraper` (the same
 * actor used for the initial metadata fetch — works for /p/, /reel/, /tv/)
 * to get a FRESH signed CDN URL, then streams from that URL. This replaces
 * the old `instagram-reel-scraper` approach which only accepted /reel/ URLs
 * and would 400 on regular /p/ feed posts.
 *
 * Rationale: the initial Apify metadata call gives us a signed CDN URL, but
 * it may have expired by the time the worker reaches the bundling step
 * (especially on retries or after a transient failure). Re-calling Apify gets
 * a brand-new signed URL. Cheaper than `reel-scraper` (one /api/v2 call, no
 * `includeDownloadedVideo` MB charge) and works for all post types.
 */
async function downloadVideoApifyFresh(igUrl: string, signal?: AbortSignal): Promise<string> {
  if (!config.apifyToken) throw new Error('APIFY_TOKEN missing — cannot use Apify fallback');
  const r = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${config.apifyToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directUrls: [igUrl], resultsLimit: 1 }),
      signal,
    });
  if (!r.ok) throw new Error(`apify metadata refresh ${r.status}`);
  const items = await r.json() as Array<{ videoUrl?: string }>;
  if (!items.length || !items[0].videoUrl) throw new Error('apify refresh: no videoUrl');

  const dir = await mkdtemp(join(tmpdir(), 'ig-video-apify-fresh-'));
  const out = join(dir, 'video.mp4');
  const dl = await fetch(items[0].videoUrl, { signal, headers: CDN_FETCH_HEADERS });
  if (!dl.ok || !dl.body) throw new Error(`apify-fresh stream ${dl.status}`);
  await Bun.write(out, dl);
  return out;
}

export function buildWorld() {
  if (!config.supabaseUrl || !config.supabaseServiceKey || !config.groqApiKey) {
    throw new Error('ig-worker: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GROQ_API_KEY');
  }
  const supabase = createSupabaseClient({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey });
  const groq = new Groq({ apiKey: config.groqApiKey });

  const queue = createQueue(supabase);
  const fetchPost = createFetchPost({ apifyToken: config.apifyToken });
  const transcribe = createTranscriber({ groq });
  const extractFrames = createFrameExtractor();
  const ocr = createOcr({ apiKey: config.googleVisionApiKey ?? '' });
  const buildBundle = createBundleBuilder({
    transcribe: (input) => transcribe({ ...input, biasPrompt: BIAS_PROMPT }),
    ocr,
    downloadVideo,
    downloadVideoFallback: downloadVideoYtDlp,
    downloadVideoApify: downloadVideoApifyFresh,
    downloadImage,
    extractFrames,
    biasPrompt: BIAS_PROMPT,
  });
  const extract = createExtractor({ groq, cerebrasApiKey: config.cerebrasApiKey });
  const geocode = createGeocoder({
    googleLookup: realGoogleLookup(config.googleMapsApiKey ?? ''),
    kakaoLookup:  config.kakaoRestApiKey ? realKakaoLookup(config.kakaoRestApiKey) : async () => null,
  });
  const upsertPost = upsertPostFactory(supabase);
  const savePlaces = createSavePlaces(supabase);
  const fetchComments = createCommentsFetcher({ apifyToken: config.apifyToken });

  const processor = createProcessor({
    fetchPost, upsertPost, buildBundle, extract, geocode, savePlaces,
    fetchComments,
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
    // Probe yt-dlp once at boot so the operator sees the warning during
    // start-up rather than after submitting the first job. Fire-and-forget.
    void probeYtDlpOnce();
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

  const places = await r.json() as unknown[];
  const contentRange = r.headers.get('Content-Range') ?? '';
  // Format: "0-49/123" or "*/0"
  const total = Number(contentRange.split('/')[1] ?? 0) || 0;
  return {
    places,
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
      // Trim large strings so the polling payload stays small but the user
      // can see what the LLM was looking at. Truncated previews are clearly
      // marked client-side.
      post_preview: post ? {
        caption: post.caption ? post.caption.slice(0, 500) : null,
        caption_truncated: !!post.caption && post.caption.length > 500,
        transcript: post.transcript ? post.transcript.slice(0, 800) : null,
        transcript_truncated: !!post.transcript && post.transcript.length > 800,
        has_ocr: !!post.ocr_text,
        location_tag: post.location_tag,
      } : null,
    };
  });
}
