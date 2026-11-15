import { rm } from 'node:fs/promises';

/** Largest video the worker will hold on disk. Instagram reels are a few
 *  MB to a few tens of MB; anything bigger is not worth a 1 GB droplet. */
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
/** Same, for a single carousel image. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** yt-dlp's `--max-filesize` value for the same cap. */
export const YT_DLP_MAX_FILESIZE = `${Math.floor(MAX_VIDEO_BYTES / (1024 * 1024))}M`;

/**
 * Stream a response body to `outPath`, never holding more than one chunk in
 * memory and never writing more than `maxBytes`. A declared Content-Length
 * over the cap is refused before reading anything; a body that runs past the
 * cap is cut off and the partial file removed. Returns the bytes written.
 *
 * Reads through the body's reader rather than `Bun.write(path, response)`,
 * which deadlocked on bodies from fetches started with an AbortSignal
 * (Bun 1.3.0: the writer never received a chunk).
 */
export async function saveBodyToFile(res: Response, outPath: string, maxBytes: number): Promise<number> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`media too large: ${declared} bytes (cap ${maxBytes})`);
  }
  if (!res.body) throw new Error('media download: empty body');

  const reader = res.body.getReader();
  const sink = Bun.file(outPath).writer();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`media too large: over ${maxBytes} bytes`);
      }
      sink.write(value);
    }
    await sink.end();
    return total;
  } catch (err) {
    try { await sink.end(); } catch { /* the error below is the one that matters */ }
    await rm(outPath, { force: true });
    throw err;
  }
}
