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

async function downloadVideo(url: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-video-'));
  const out = join(dir, 'video.mp4');
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`video download ${r.status}`);
  await Bun.write(out, r);
  return out;
}

async function downloadImage(url: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-image-'));
  const out = join(dir, 'image.jpg');
  const r = await fetch(url);
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
    complete: queue.complete, fail: queue.fail,
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
