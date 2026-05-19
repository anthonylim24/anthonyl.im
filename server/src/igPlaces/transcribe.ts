import type Groq from 'groq-sdk';
import { createReadStream } from 'node:fs';

interface VerboseSegment { start: number; end: number; text: string; avg_logprob: number; }
interface VerboseTranscription { segments?: VerboseSegment[]; text?: string; }

export interface TranscriberDeps {
  groq: Pick<Groq, 'audio'>;
}

export interface TranscribeInput {
  filePath: string;
  biasPrompt: string;
}

export type Transcriber = (input: TranscribeInput) => Promise<string>;

export const BIAS_PROMPT =
  'Seoul, Busan, Gangnam, Hongdae, Myeongdong, Itaewon, Insadong, Haeundae, Jagalchi, ' +
  'KTX, jjajangmyeon, bibimbap, Anguk, Hannam, Seongsu, Yongsan, Cheongdam, hanok.';

export function createTranscriber(deps: TranscriberDeps): Transcriber {
  return async function transcribe({ filePath, biasPrompt }) {
    const baseParams = {
      model: 'whisper-large-v3-turbo',
      response_format: 'verbose_json',
      prompt: biasPrompt,
      temperature: 0,
    } as const;
    const [koRes, autoRes] = await Promise.all([
      deps.groq.audio.transcriptions.create({
        ...baseParams, file: createReadStream(filePath) as any, language: 'ko',
      } as any),
      deps.groq.audio.transcriptions.create({
        ...baseParams, file: createReadStream(filePath) as any,
      } as any),
    ]);
    return mergeSegments(koRes as VerboseTranscription, autoRes as VerboseTranscription);
  };
}

export function mergeSegments(a: VerboseTranscription, b: VerboseTranscription): string {
  const segs: VerboseSegment[] = [...(a.segments ?? []), ...(b.segments ?? [])]
    .sort((x, y) => x.start - y.start);
  if (!segs.length) return (a.text ?? b.text ?? '').trim();
  const picked: VerboseSegment[] = [];
  for (const seg of segs) {
    const overlap = picked.findIndex(p => !(p.end <= seg.start || p.start >= seg.end));
    if (overlap === -1) picked.push(seg);
    else if (seg.avg_logprob > picked[overlap].avg_logprob) picked[overlap] = seg;
  }
  return picked.map(s => s.text.trim()).filter(Boolean).join(' ').trim();
}
