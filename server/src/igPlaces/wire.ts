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
    ocr, downloadVideo, downloadImage, extractFrames, biasPrompt: BIAS_PROMPT,
  });
  const extract = createExtractor({ groq });
  const geocode = createGeocoder({
    googleLookup: realGoogleLookup(config.googleMapsApiKey ?? ''),
    kakaoLookup:  config.kakaoRestApiKey ? realKakaoLookup(config.kakaoRestApiKey) : async () => null,
  });
  const upsertPost = upsertPostFactory(supabase);
  const savePlaces = createSavePlaces(supabase);

  const processor = createProcessor({
    fetchPost, upsertPost, buildBundle, extract, geocode, savePlaces,
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
  return booted?.queue ?? buildWorld().queue;
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
      `is_subject,supporting_quote,address,lat,lng,geocode_source,geocode_disagree`;
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

  return jobs.map(j => ({
    ...j,
    places: j.post_id != null ? (placesByPost[j.post_id] ?? []) : [],
    logs: logsByJob[j.id] ?? [],
  }));
}
