export type OAuthCallbackError = 'cancelled' | 'failed';

/**
 * Classify Supabase/provider callback parameters without exposing provider error
 * details to the user or trusting any redirect parameter from the URL.
 */
export function classifyOAuthCallback(searchParams: URLSearchParams): OAuthCallbackError | null {
  const error = searchParams.get('error')?.toLowerCase() ?? '';
  const errorCode = searchParams.get('error_code')?.toLowerCase() ?? '';
  if (error === 'access_denied' || errorCode === 'access_denied') return 'cancelled';
  if (error || errorCode || searchParams.has('error_description')) return 'failed';
  if (!searchParams.get('code')) return 'failed';
  return null;
}

/** Always return to the workspace on this request's origin; ignore `next`, `redirect`, and similar parameters. */
export function getOAuthCallbackDestination(requestUrl: string, error: OAuthCallbackError | null): URL {
  const callbackUrl = new URL(requestUrl);
  const destination = new URL('/', callbackUrl.origin);
  if (error) destination.searchParams.set('authError', error);
  return destination;
}

export async function resolveOAuthCallback(
  requestUrl: string,
  searchParams: URLSearchParams,
  exchangeCode: (code: string) => Promise<{ error?: unknown }>
): Promise<URL> {
  const callbackError = classifyOAuthCallback(searchParams);
  if (callbackError) return getOAuthCallbackDestination(requestUrl, callbackError);

  const code = searchParams.get('code');
  if (!code) return getOAuthCallbackDestination(requestUrl, 'failed');

  try {
    const result = await exchangeCode(code);
    return getOAuthCallbackDestination(requestUrl, result.error ? 'failed' : null);
  } catch {
    return getOAuthCallbackDestination(requestUrl, 'failed');
  }
}
