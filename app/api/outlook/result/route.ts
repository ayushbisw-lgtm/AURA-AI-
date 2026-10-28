import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const result = new URL('/?workspace=academic&section=notices', request.url);
  const connected = request.nextUrl.searchParams.get('connected');
  const error = request.nextUrl.searchParams.get('error');
  if (connected === '1') result.searchParams.set('outlook', 'connected');
  if (error) result.searchParams.set('outlookError', error.slice(0, 240));
  return NextResponse.redirect(result);
}
