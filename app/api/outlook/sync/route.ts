import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchMessages } from '@/lib/outlook/graph';
import { processMessage } from '@/lib/outlook/processor';
import { graphAccessToken, getConnection, requireOutlookUser, outlookError } from '@/lib/outlook/server';
import { isSameOriginRequest } from '@/lib/outlook/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'This request could not be verified.' }, { status: 403 });
  try {
    const { user, db } = await requireOutlookUser();
    const connection = await getConnection(db, user.id);
    if (!connection || connection.status !== 'connected') throw new Error('OUTLOOK_NOT_CONNECTED');
    const body = await request.json().catch(() => ({})) as { limit?: unknown };
    const limit = Math.min(Math.max(typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.floor(body.limit) : 150, 1), 250);
    const startedAt = new Date();
    const staleBefore = new Date(startedAt.getTime() - 5 * 60_000).toISOString();
    const { data: lock, error: lockError } = await db.from('microsoft_mailbox_connections').update({ sync_status: 'syncing', sync_started_at: startedAt.toISOString(), sync_error: null, updated_at: startedAt.toISOString() }).eq('user_id', user.id).or(`sync_status.neq.syncing,sync_started_at.is.null,sync_started_at.lt.${staleBefore}`).select('user_id').maybeSingle();
    if (lockError) throw lockError;
    if (!lock) return NextResponse.json({ error: 'A notice sync is already running. Try again in a moment.' }, { status: 409 });
    const token = await graphAccessToken(db, user.id);
    const result = await fetchMessages({ token, deltaLink: connection.delta_link, maxMessages: limit });
    const client = await createSupabaseServerClient();
    const rows = result.messages.map(message => ({ user_id: user.id, ...processMessage(message, connection.microsoft_user_id) }));
    if (rows.length) {
      const { error } = await client.from('college_notices').upsert(rows, { onConflict: 'user_id,microsoft_user_id,message_id', ignoreDuplicates: true });
      if (error) throw error;
    }
    const syncedAt = new Date().toISOString();
    const { error: stateError } = await db.from('microsoft_mailbox_connections').update({ delta_link: result.deltaLink, last_synced_at: syncedAt, sync_status: 'success', sync_started_at: null, sync_error: null, updated_at: syncedAt }).eq('user_id', user.id);
    if (stateError) throw stateError;
    return NextResponse.json({ saved: rows.length, lastSyncedAt: syncedAt, syncStatus: 'success' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safe = message === 'GRAPH_PERMISSION_DENIED' ? 'Microsoft denied mailbox access. Confirm delegated Mail.Read consent in the college tenant.'
      : message === 'GRAPH_THROTTLED' ? 'Microsoft is limiting requests right now. Wait a little and try again.'
        : message.startsWith('GRAPH_HTTP_') ? 'Microsoft Graph could not complete this sync. Try again later.' : undefined;
    try {
      const { user, db } = await requireOutlookUser();
      await db.from('microsoft_mailbox_connections').update({ sync_status: 'error', sync_started_at: null, sync_error: safe ?? 'Sync failed. Try again later.', updated_at: new Date().toISOString() }).eq('user_id', user.id);
    } catch { /* status update is best-effort; never log email data or tokens */ }
    const result = outlookError(error);
    return NextResponse.json({ error: safe ?? result.message }, { status: message === 'GRAPH_PERMISSION_DENIED' ? 403 : message === 'GRAPH_THROTTLED' ? 429 : result.status });
  }
}
