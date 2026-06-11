export interface SseReadOptions {
  onData: (data: string) => void;   // called per `data:` payload, "[DONE]" excluded
  signal?: AbortSignal;
}

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  opts: SseReadOptions,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return true; // signal done
      opts.onData(payload);
    }
    return false;
  };

  try {
    while (true) {
      if (opts.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (opts.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (processLine(line)) return;
      }
    }
    // Flush trailing buffered line
    if (buffer.trim()) {
      processLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}
