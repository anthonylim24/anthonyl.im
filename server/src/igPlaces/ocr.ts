import { readFile as readFileNode } from 'node:fs/promises';

export interface OcrDeps {
  apiKey: string;
  fetch?: typeof fetch;
  readFile?: (path: string) => Promise<Uint8Array>;
}

export type Ocr = (imagePath: string) => Promise<string>;

export function createOcr(deps: OcrDeps): Ocr {
  const f = deps.fetch ?? fetch;
  const rf = deps.readFile ?? readFileNode;

  return async function ocr(imagePath) {
    const bytes = await rf(imagePath);
    const b64 = Buffer.from(bytes).toString('base64');
    const r = await f(`https://vision.googleapis.com/v1/images:annotate?key=${deps.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: b64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['ko', 'en'] },
        }],
      }),
    });
    if (!r.ok) throw new Error(`vision ${r.status}`);
    const data = (await r.json()) as { responses?: Array<{ fullTextAnnotation?: { text?: string } }> };
    return data.responses?.[0]?.fullTextAnnotation?.text?.trim() ?? '';
  };
}
