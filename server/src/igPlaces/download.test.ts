import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveBodyToFile } from './download';

function streamOf(chunks: number[], onPull?: () => void): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      if (i >= chunks.length) return controller.close();
      controller.enqueue(new Uint8Array(chunks[i++]!));
    },
  });
}

describe('saveBodyToFile', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'ig-dl-test-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  test('writes the whole body when it fits', async () => {
    const out = join(dir, 'ok.bin');
    const n = await saveBodyToFile(new Response(streamOf([10, 20, 30])), out, 100);
    expect(n).toBe(60);
    expect((await stat(out)).size).toBe(60);
  });

  test('refuses a declared Content-Length over the cap without reading the body', async () => {
    let pulls = 0;
    const res = new Response(streamOf([10], () => pulls++), { headers: { 'Content-Length': '500' } });
    await expect(saveBodyToFile(res, join(dir, 'big.bin'), 100)).rejects.toThrow(/too large/);
    expect(pulls).toBeLessThanOrEqual(1); // at most the stream's own start-up pull
  });

  test('cuts off a body that runs past the cap and removes the partial file', async () => {
    const out = join(dir, 'runaway.bin');
    let pulls = 0;
    // No Content-Length: an endless stream of 40-byte chunks.
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(40)); },
    });
    await expect(saveBodyToFile(new Response(endless), out, 100)).rejects.toThrow(/too large/);
    expect(pulls).toBeLessThan(10);
    await expect(stat(out)).rejects.toThrow();
  });
});
