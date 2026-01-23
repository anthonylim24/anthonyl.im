interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ApiResponse {
  content: string;
  error?: string;
}

export async function invokeDeepseek(
  prompt: string,
  messages: Message[] = [],
  onUpdate?: (content: string) => void
): Promise<ApiResponse> {
  const response = await fetch('/api/invoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ prompt, messages }),
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is null');
  }

  let content = '';
  let buffer = '';
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      // Add new chunk to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines from buffer
      const lines = buffer.split('\n');

      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6);

          if (data === '[DONE]') {
            return { content };
          }

          content += data;
          onUpdate?.(content);
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.trim().slice(6);
      if (data !== '[DONE]') {
        content += data;
        onUpdate?.(content);
      }
    }

    return { content };
  } finally {
    reader.releaseLock();
  }
}
