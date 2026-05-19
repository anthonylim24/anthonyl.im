// server/src/igPlaces/eval/run.ts
//
// Runs the pipeline against fixtures and prints a precision/recall table.
//
// Usage: bun run server/src/igPlaces/eval/run.ts

import Groq from 'groq-sdk';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PostPayload, EnrichedPlace } from '../types';
import { createBundleBuilder } from '../buildBundle';
import { createExtractor } from '../extractPlaces';
import { createGeocoder, realGoogleLookup, realKakaoLookup } from '../geocode';
import { scoreFixture, type ExpectedPlace } from './score';

const FIX_DIR = join(import.meta.dir, 'fixtures');

async function loadFixtures(): Promise<{ name: string; input: PostPayload; expected: ExpectedPlace[] }[]> {
  const dirs = (await readdir(FIX_DIR, { withFileTypes: true }))
    .filter(d => d.isDirectory()).map(d => d.name).sort();
  const out: { name: string; input: PostPayload; expected: ExpectedPlace[] }[] = [];
  for (const d of dirs) {
    const input    = JSON.parse(await readFile(join(FIX_DIR, d, 'input.json'), 'utf8')) as PostPayload;
    const exp      = JSON.parse(await readFile(join(FIX_DIR, d, 'expected.json'), 'utf8')) as { places: ExpectedPlace[] };
    out.push({ name: d, input, expected: exp.places });
  }
  return out;
}

async function main() {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) throw new Error('GROQ_API_KEY required');

  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
  const kakaoRestApiKey  = process.env.KAKAO_REST_API_KEY;

  const groq = new Groq({ apiKey: groqApiKey });

  // Skip video/image work in eval — fixtures should include transcript/ocr inline if needed.
  const noopTranscribe = async () => '';
  const noopOcr        = async () => '';
  const noopDownload   = async () => '';
  const noopFrames     = async () => [];

  const buildBundle = createBundleBuilder({
    transcribe: noopTranscribe, ocr: noopOcr,
    downloadVideo: noopDownload, extractFrames: noopFrames,
  });
  const extract = createExtractor({ groq });
  const geocode = createGeocoder({
    googleLookup: realGoogleLookup(googleMapsApiKey),
    kakaoLookup:  kakaoRestApiKey ? realKakaoLookup(kakaoRestApiKey) : async () => null,
  });

  const fixtures = await loadFixtures();
  const rows: Array<{ name: string; ext_p: number; ext_r: number; cat: number; geo: number }> = [];
  for (const f of fixtures) {
    const bundle   = await buildBundle(f.input);
    const voted    = await extract(bundle);
    const enriched: EnrichedPlace[] = await Promise.all(voted.map(v => geocode(v, f.input.locationTag)));
    const s = scoreFixture(enriched, f.expected);
    rows.push({ name: f.name, ext_p: s.extPrecision, ext_r: s.extRecall, cat: s.catAccuracy, geo: s.geoAccuracy });
  }

  console.log('\n' + 'fixture'.padEnd(50) + 'ext-P\text-R\tcat\tgeo');
  for (const r of rows) console.log(r.name.padEnd(50) +
    `${r.ext_p.toFixed(2)}\t${r.ext_r.toFixed(2)}\t${r.cat.toFixed(2)}\t${r.geo.toFixed(2)}`);
  const tot = rows.reduce((a, r) => ({
    ext_p: a.ext_p + r.ext_p, ext_r: a.ext_r + r.ext_r,
    cat: a.cat + r.cat, geo: a.geo + r.geo,
  }), { ext_p: 0, ext_r: 0, cat: 0, geo: 0 });
  const n = rows.length || 1;
  console.log('-'.repeat(80));
  console.log('TOTAL'.padEnd(50) +
    `${(tot.ext_p/n).toFixed(2)}\t${(tot.ext_r/n).toFixed(2)}\t${(tot.cat/n).toFixed(2)}\t${(tot.geo/n).toFixed(2)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
