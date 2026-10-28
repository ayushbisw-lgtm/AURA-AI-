import type { GraphMessage } from './processor';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const SELECT = 'id,internetMessageId,subject,receivedDateTime,webLink,from,body,hasAttachments,importance,isRead';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export type GraphFetchResult = { messages: GraphMessage[]; deltaLink: string | null; resetCursor: boolean };

export async function graphGet(url: string, token: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://graph.microsoft.com' || !parsed.pathname.startsWith('/v1.0/')) throw new Error('Microsoft Graph returned an invalid pagination URL.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' }, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) return response;
    const retryHeader = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryHeader) && retryHeader > 0 ? Math.min(retryHeader * 1000, 8000) : 400 * 2 ** attempt);
  }
  throw new Error('Microsoft Graph request failed.');
}

export async function fetchMessages({ token, deltaLink, maxMessages = 150, fetcher = fetch }: { token: string; deltaLink: string | null; maxMessages?: number; fetcher?: typeof fetch }): Promise<GraphFetchResult> {
  let url = deltaLink || `${GRAPH_ROOT}/me/messages/delta?$select=${encodeURIComponent(SELECT)}&$filter=${encodeURIComponent(`receivedDateTime ge ${new Date(Date.now() - 30 * 86400_000).toISOString()}`)}&$top=50`;
  const messages: GraphMessage[] = [];
  let nextDelta: string | null = null;
  while (url && messages.length < Math.min(Math.max(maxMessages, 1), 250)) {
    const response = await graphGet(url, token, fetcher);
    if ((response.status === 410 || response.status === 412) && deltaLink) {
      return fetchMessages({ token, deltaLink: null, maxMessages, fetcher }).then((result): GraphFetchResult => ({ ...result, resetCursor: true }));
    }
    if (response.status === 401 || response.status === 403) throw new Error('GRAPH_PERMISSION_DENIED');
    if (!response.ok) throw new Error(response.status === 429 ? 'GRAPH_THROTTLED' : `GRAPH_HTTP_${response.status}`);
    const page = await response.json() as { value?: GraphMessage[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string };
    messages.push(...(page.value ?? []).slice(0, Math.min(Math.max(maxMessages, 1), 250) - messages.length));
    url = page['@odata.nextLink'] || '';
    if (page['@odata.deltaLink']) nextDelta = page['@odata.deltaLink'];
    if (!url && nextDelta) break;
  }
  if (!nextDelta && url && messages.length >= maxMessages) nextDelta = url;
  return { messages, deltaLink: nextDelta, resetCursor: false };
}
