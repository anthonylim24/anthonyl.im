interface DeepseekResponse {
  content: string;
  error?: string;
}

export async function invokeDeepseek(
  prompt: string,
  onUpdate?: (content: string) => void
): Promise<DeepseekResponse> {
  return new Promise((resolve, reject) => {
    try {
      let content = '';
      const eventSource = new EventSource(`/api/invoke?prompt=${encodeURIComponent(prompt)}`, {
        withCredentials: true
      });

      eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
          eventSource.close();
          resolve({ content });
          return;
        }
        content += event.data;
        onUpdate?.(content);
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        console.error('EventSource error:', error);
        reject({
          content: 'An error has occurred',
          error: 'Error in SSE connection'
        });
      };

    } catch (error) {
      console.error('Error invoking Deepseek:', error);
      reject({
        content: 'An error has occurred',
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  });
}
