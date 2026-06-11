import { readSseStream } from './sseStream';

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ApiResponse {
  content: string;
  error?: string;
}

const WATCHDOG_INTERVAL_MS = 5_000;
const WATCHDOG_SILENCE_LIMIT_MS = 45_000;

export async function invokeDeepseek(
  prompt: string,
  messages: Message[] = [],
  onUpdate?: (content: string) => void
): Promise<ApiResponse> {
  const controller = new AbortController();

  let lastActivity = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > WATCHDOG_SILENCE_LIMIT_MS) {
      controller.abort(new Error('Response timed out — please try again.'));
    }
  }, WATCHDOG_INTERVAL_MS);

  try {
    const response = await fetch('/api/invoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ prompt, messages }),
      credentials: 'include',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    let content = '';

    await readSseStream(response.body, {
      signal: controller.signal,
      onData: (data) => {
        lastActivity = Date.now();
        let chunk: string;
        try {
          chunk = JSON.parse(data);
        } catch {
          chunk = data;
        }
        content += chunk;
        try { onUpdate?.(content); } catch { /* swallow — callback errors must not corrupt content */ }
      },
    });

    return { content };
  } catch (err) {
    if (
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.message.includes('timed out'))
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new (Error as any)('Response timed out — please try again.', { cause: err });
    }
    throw err;
  } finally {
    clearInterval(watchdog);
  }
}
