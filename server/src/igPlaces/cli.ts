// server/src/igPlaces/cli.ts
//
// Manual E2E: run the full pipeline against an IG URL with real APIs,
// print structured output, don't write to DB.
//
// Usage: bun run server/src/igPlaces/cli.ts <instagram-url>

import Groq from 'groq-sdk';
import { config } from '../config';
import { createFetchPost } from './fetchPost';
import { createTranscriber, BIAS_PROMPT } from './transcribe';
import { createFrameExtractor } from './extractFrames';
import { createOcr } from './ocr';
import { createBundleBuilder } from './buildBundle';
import { createExtractor } from './extractPlaces';
import { createGeocoder, realGoogleLookup, realKakaoLookup } from './geocode';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function downloadVideo(url: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-cli-'));
  const out = join(dir, 'video.mp4');
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`download ${r.status}`);
  await Bun.write(out, r);
  return out;
}

async function downloadImage(url: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-cli-img-'));
  const out = join(dir, 'image.jpg');
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`image download ${r.status}`);
  await Bun.write(out, r);
  return out;
}

async function main() {
  const url = process.argv[2];
  if (!url) { console.error('usage: bun run cli.ts <instagram-url>'); process.exit(1); }
  if (!config.groqApiKey) throw new Error('GROQ_API_KEY required');

  const groq = new Groq({ apiKey: config.groqApiKey });
  const fetchPost = createFetchPost({ apifyToken: config.apifyToken });
  const transcribe = createTranscriber({ groq });
  const extractFrames = createFrameExtractor();
  const ocr = createOcr({ apiKey: config.googleVisionApiKey ?? '' });
  const buildBundle = createBundleBuilder({
    transcribe: (i) => transcribe({ ...i, biasPrompt: BIAS_PROMPT }),
    ocr, downloadVideo, downloadImage, extractFrames, biasPrompt: BIAS_PROMPT,
  });
  const extract = createExtractor({ groq });
  const geocode = createGeocoder({
    googleLookup: realGoogleLookup(config.googleMapsApiKey ?? ''),
    kakaoLookup:  config.kakaoRestApiKey ? realKakaoLookup(config.kakaoRestApiKey) : async () => null,
  });

  console.log('[cli] fetching post …');
  const payload = await fetchPost(url, null);
  console.log('[cli] fetched via', payload.source, '— caption:', payload.caption.slice(0, 80));

  console.log('[cli] building bundle …');
  const bundle = await buildBundle(payload);
  if (bundle.transcript) console.log('[cli] transcript:', bundle.transcript.slice(0, 200));
  if (bundle.ocr) console.log('[cli] ocr:', bundle.ocr.slice(0, 200));

  console.log('[cli] extracting places (3-vote self-consistency) …');
  const voted = await extract(bundle);
  console.log('[cli] voted places:', voted.length);

  console.log('[cli] geocoding …');
  const enriched = await Promise.all(voted.map(v => geocode(v, payload.locationTag)));

  console.log('\n=== RESULTS ===');
  for (const p of enriched) {
    console.log(JSON.stringify({
      name: p.name, name_romanized: p.name_romanized, city: p.city, category: p.category,
      confidence_band: p.confidence_band, vote_count: p.vote_count,
      is_subject: p.is_subject, supporting_quote: p.supporting_quote,
      signal_source: p.signal_source, address: p.address, lat: p.lat, lng: p.lng,
      geocode_source: p.geocode_source, geocode_disagree: p.geocode_disagree,
    }, null, 2));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
