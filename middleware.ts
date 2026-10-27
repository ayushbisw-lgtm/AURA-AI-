import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './lib/supabase/config';

export async function middleware(request: NextRequest) {
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookiesToSet => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  // Refreshes expired sessions and forwards rotated cookies to the browser.
  try {
    await supabase.auth.getUser();
  } catch {
    // Keep application routes reachable during transient Auth outages; handlers return safe errors.
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
};
