import { test, expect, describe, mock, beforeAll, afterAll } from 'bun:test';
import { createTranscriber, mergeSegments } from './transcribe';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// transcribe.ts calls `createReadStream(filePath)`. Node opens the file lazily,
// so a non-existent path slips past `await t({...})` but throws ENOENT after
// the test ends — surfacing as "Unhandled error between tests" and tipping
// bun's exit code non-zero in CI. We point the test at a real empty file
// instead so the stream constructor succeeds.
let tmpDir = '';
let audioPath = '';

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'igplaces-transcribe-test-'));
  audioPath = join(tmpDir, 'x.m4a');
  await writeFile(audioPath, '');
});
afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('mergeSegments', () => {
  test('picks higher avg_logprob per overlapping span', () => {
    const ko = { segments: [{ start: 0, end: 5, text: 'A', avg_logprob: -0.6 }] };
    const auto = { segments: [{ start: 0, end: 5, text: 'B', avg_logprob: -0.3 }] };
    expect(mergeSegments(ko, auto)).toBe('B');
  });
  test('orders by start time when non-overlapping', () => {
    const ko = { segments: [{ start: 5, end: 10, text: 'second', avg_logprob: -0.5 }] };
    const auto = { segments: [{ start: 0, end: 5, text: 'first', avg_logprob: -0.4 }] };
    expect(mergeSegments(ko, auto)).toBe('first second');
  });
});

describe('createTranscriber', () => {
  test('runs both passes in parallel and merges', async () => {
    let calls = 0;
    const groq = {
      audio: { transcriptions: { create: mock(async (opts: any) => {
        calls++;
        return {
          text: opts.language === 'ko' ? 'KO' : 'AUTO',
          segments: [{ start: 0, end: 5, text: opts.language === 'ko' ? 'KO' : 'AUTO',
                       avg_logprob: opts.language === 'ko' ? -0.6 : -0.3 }],
        };
      })}}
    } as any;
    const t = createTranscriber({ groq });
    const out = await t({ filePath: audioPath, biasPrompt: 'BIAS' });
    expect(calls).toBe(2);
    expect(out).toBe('AUTO');
  });
});
