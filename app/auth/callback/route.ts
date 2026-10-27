import { NextResponse, type NextRequest } from 'next/server';
import { resolveOAuthCallback } from '@/lib/oauth-callback';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const destination = await resolveOAuthCallback(request.url, request.nextUrl.searchParams, async code => {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.auth.exchangeCodeForSession(code);
    if (result.error) {
      console.error('[auth] OAuth code exchange failed', {
        name: result.error.name,
        code: result.error.code,
        status: result.error.status
      });
    }
    return result;
  });
  return NextResponse.redirect(destination);
}
