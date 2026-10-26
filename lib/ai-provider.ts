export type ProviderMessage = { role: 'user' | 'assistant'; content: string };

const LOCAL_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

export async function completeWithLocalModel(system: string, messages: ProviderMessage[]) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_MODEL,
      stream: false,
      messages: [{ role: 'system', content: system }, ...messages]
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}. Check that the model is downloaded and Ollama is running.`);
  const data = await response.json();
  const answer = data?.message?.content;
  if (typeof answer !== 'string') throw new Error('The local model returned an unexpected response.');
  return { message: answer, model: LOCAL_MODEL };
}

export function providerErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  const unavailable = error instanceof TypeError ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) ||
    /fetch failed|ECONNREFUSED|timed out|abort/i.test(message);
  return {
    error: unavailable ? 'Could not connect to Ollama at the configured local address, or the request timed out.' : message,
    status: unavailable ? 503 : 502
  };
}
