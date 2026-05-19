import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface ExtractFramesDeps {
  spawn?: (cmd: string[]) => { exited: Promise<number>; kill: (signal?: number) => void };
}

export type FrameExtractor = (videoPath: string, count?: number, signal?: AbortSignal) => Promise<string[]>;

export function createFrameExtractor(deps: ExtractFramesDeps = {}): FrameExtractor {
  const spawn = deps.spawn ?? ((cmd) => Bun.spawn(cmd, { stdout: 'ignore', stderr: 'pipe' }) as any);

  return async function extractFrames(videoPath, count = 5, signal) {
    const outDir = await mkdtemp(join(tmpdir(), 'ig-frames-'));
    const proc = spawn([
      'ffmpeg', '-y',
      // Stall after 10s of no input (e.g. stuck download upstream)
      '-rw_timeout', '10000000',
      '-i', videoPath,
      '-vf', `fps=1/5,scale=720:-2`,
      '-frames:v', String(count),
      '-q:v', '3',
      join(outDir, 'frame-%02d.jpg'),
    ]);
    const onAbort = () => { try { proc.kill?.(); } catch {} };
    signal?.addEventListener('abort', onAbort);
    try {
      const code = await proc.exited;
      if (signal?.aborted) throw new Error('ffmpeg aborted');
      if (code !== 0) throw new Error(`ffmpeg exit ${code}`);
      const files = (await readdir(outDir))
        .filter(f => f.startsWith('frame-') && f.endsWith('.jpg'))
        .sort();
      return files.map(f => join(outDir, f));
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  };
}
