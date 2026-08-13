const OPEN = "<think>";
const CLOSE = "</think>";

export type StripThinkResult = {
  think: string | null;
  main: string;
  thinking: boolean;
};

function looksLikePartialTag(suffix: string): boolean {
  if (!suffix.startsWith("<") || suffix.length < 2) return false;
  return OPEN.startsWith(suffix) || CLOSE.startsWith(suffix);
}

/** Drop a trailing incomplete `<think` / `</think` fragment while streaming. */
export function stripTrailingPartialTag(content: string): string {
  const i = content.lastIndexOf("<");
  if (i < 0) return content;
  const suffix = content.slice(i);
  if (looksLikePartialTag(suffix)) return content.slice(0, i);
  return content;
}

/**
 * Split gpt-oss `<think>…</think>` blocks without leaking raw tags into markdown.
 * Incomplete blocks (typical mid-stream) go into `think` with `thinking: true`.
 */
export function stripThink(content: string, isStreaming = false): StripThinkResult {
  const raw = isStreaming ? stripTrailingPartialTag(content) : content;
  const openIdx = raw.indexOf(OPEN);

  if (openIdx < 0) {
    return { think: null, main: raw, thinking: false };
  }

  const afterOpen = openIdx + OPEN.length;
  const closeIdx = raw.indexOf(CLOSE, afterOpen);

  if (closeIdx < 0) {
    return {
      think: raw.slice(afterOpen),
      main: raw.slice(0, openIdx),
      thinking: true,
    };
  }

  const think = raw.slice(afterOpen, closeIdx);
  const main = `${raw.slice(0, openIdx)}${raw.slice(closeIdx + CLOSE.length)}`.replace(
    /^\s+/,
    "",
  );

  return { think, main, thinking: false };
}
