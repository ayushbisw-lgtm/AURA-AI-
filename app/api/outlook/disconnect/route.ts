import { NextResponse } from 'next/server';
import { requireOutlookUser, outlookError } from '@/lib/outlook/server';
import { isSameOriginRequest } from '@/lib/outlook/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'This request could not be verified.' }, { status: 403 });
  try {
    const { user, db } = await requireOutlookUser();
    const { error } = await db.from('microsoft_mailbox_connections').delete().eq('user_id', user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true, message: 'Outlook credentials removed. Revoke AURA AI under Microsoft account app permissions to remove the remote grant.' });
  } catch (error) { const result = outlookError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
