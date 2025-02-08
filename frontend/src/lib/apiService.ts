interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DeepseekResponse {
  content: string;
  error?: string;
}

export async function invokeDeepseek(
  prompt: string,
  messages: Message[] = [],
  onUpdate?: (content: string) => void
): Promise<DeepseekResponse> {
  return new Promise(async (resolve, reject) => {
    try {
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
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        // Parse SSE format
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix
            if (data === '[DONE]') {
              return resolve({ content });
            }
            content += data;
            onUpdate?.(content);
          }
        }
      }

      resolve({ content });
    } catch (error) {
      console.error('Error invoking Deepseek:', error);
      reject({
        content: 'An error has occurred',
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  });
}
