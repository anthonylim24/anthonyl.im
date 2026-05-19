import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface ExtractFramesDeps {
  spawn?: (cmd: string[]) => { exited: Promise<number> };
}

export type FrameExtractor = (videoPath: string, count?: number) => Promise<string[]>;

export function createFrameExtractor(deps: ExtractFramesDeps = {}): FrameExtractor {
  const spawn = deps.spawn ?? ((cmd) => Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' }) as any);

  return async function extractFrames(videoPath, count = 5) {
    const outDir = await mkdtemp(join(tmpdir(), 'ig-frames-'));
    const proc = spawn([
      'ffmpeg', '-y',
      '-i', videoPath,
      '-vf', `fps=1/5,scale=720:-2`,
      '-frames:v', String(count),
      '-q:v', '3',
      join(outDir, 'frame-%02d.jpg'),
    ]);
    const code = await proc.exited;
    if (code !== 0) throw new Error(`ffmpeg exit ${code}`);
    const files = (await readdir(outDir))
      .filter(f => f.startsWith('frame-') && f.endsWith('.jpg'))
      .sort();
    return files.map(f => join(outDir, f));
  };
}
