import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getConnection, requireOutlookUser, outlookError } from '@/lib/outlook/server';
import { isSameOriginRequest } from '@/lib/outlook/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { user, db } = await requireOutlookUser();
    const connection = await getConnection(db, user.id);
    if (new URL(request.url).searchParams.get('resource') === 'status') {
      return NextResponse.json({ connected: connection?.status === 'connected', email: connection?.email ?? null, displayName: connection?.display_name ?? null, lastSyncedAt: connection?.last_synced_at ?? null, syncStatus: connection?.sync_status ?? 'never', syncError: connection?.sync_error ?? null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const client = await createSupabaseServerClient();
    const params = new URL(request.url).searchParams;
    let query = client.from('college_notices').select('id,message_id,subject,sender_name,sender_address,received_at,web_link,summary,category,importance,extracted_dates,action_items,processing_status,confidence,attachment_metadata,is_notice,archived,read_at,ignored,created_at,updated_at').eq('user_id', user.id).eq('is_notice', true).eq('ignored', false).eq('archived', params.get('archived') === 'true');
    const category = params.get('category');
    if (category && ['exam','assignment','fees','timetable','attendance','event','administrative','other'].includes(category)) query = query.eq('category', category);
    if (params.get('unread') === 'true') query = query.is('read_at', null);
    if (params.get('review') === 'true') query = query.eq('processing_status', 'review_needed');
    const after = params.get('after'); if (after && Number.isFinite(Date.parse(after))) query = query.gte('received_at', after);
    const before = params.get('before'); if (before && Number.isFinite(Date.parse(before))) query = query.lte('received_at', before);
    const search = params.get('q')?.trim().slice(0, 100);
    if (search) query = query.or(`subject.ilike.%${search.replace(/[%,_()]/g, ' ')}%,sender_name.ilike.%${search.replace(/[%,_()]/g, ' ')}%`);
    const { data, error } = await query.order('received_at', { ascending: false }).limit(200);
    if (error) throw error;
    return NextResponse.json({ notices: data ?? [], connection: connection?.status === 'connected' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { const result = outlookError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'This request could not be verified.' }, { status: 403 });
  try {
    const { user } = await requireOutlookUser();
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Choose a valid notice.' }, { status: 400 });
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.action === 'archive') updates.archived = true;
    else if (body.action === 'restore') updates.archived = false;
    else if (body.action === 'read') updates.read_at = new Date().toISOString();
    else if (body.action === 'unread') updates.read_at = null;
    else if (body.action === 'ignore') updates.ignored = true;
    else if (body.action === 'correct' && ['exam','assignment','fees','timetable','attendance','event','administrative','other'].includes(String(body.category))) updates.category = body.category;
    else return NextResponse.json({ error: 'Choose a valid notice action.' }, { status: 400 });
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from('college_notices').update(updates).eq('id', id).eq('user_id', user.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Notice not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) { const result = outlookError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
