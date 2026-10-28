import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/config';
import { DEFAULT_REMINDER_OFFSETS, reminderTimes } from '@/lib/exam-planner';
import { buildReminderEmail } from '@/lib/exam-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Resource = 'subjects' | 'exams' | 'topics' | 'sessions' | 'preferences' | 'imports' | 'history';
const TABLES: Record<Resource, string> = {
  subjects: 'exam_subjects', exams: 'exams', topics: 'exam_topics', sessions: 'study_sessions',
  preferences: 'reminder_preferences', imports: 'timetable_imports', history: 'reminder_delivery_logs'
};

async function ownerClient() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('AUTH_REQUIRED');
  return { client, user: data.user };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in to use Exam Planner.' }, { status: 401 });
  if (message.includes('NEXT_PUBLIC_SUPABASE_')) return NextResponse.json({ error: 'Exam Planner cloud storage is not configured. Set the Supabase URL and publishable key, then redeploy.' }, { status: 503 });
  console.error('[exam-planner] request failed', { name: error instanceof Error ? error.name : 'UnknownError' });
  return NextResponse.json({ error: 'Could not complete that Exam Planner action. Check the migration and try again.' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const { client, user } = await ownerClient();
    const selected = new URL(request.url).searchParams.get('resource');
    const status = { supabaseConfigured: hasSupabaseConfig(), emailProviderConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && process.env.NEXT_PUBLIC_APP_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), verifiedEmail: Boolean(user.email_confirmed_at), email: user.email ?? '' };
    if (selected === 'status') return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
    const resources: Resource[] = selected && selected in TABLES ? [selected as Resource] : ['subjects', 'exams', 'topics', 'sessions', 'preferences', 'imports', 'history'];
    const results = await Promise.all(resources.map(async resource => {
      const query = client.from(TABLES[resource]).select('*').eq('user_id', user.id);
      const ordered = resource === 'history' ? query.order('created_at', { ascending: false }).limit(50)
        : resource === 'exams' ? query.order('exam_at')
          : resource === 'sessions' ? query.order('session_at') : query;
      const { data, error } = await ordered;
      if (error) throw error;
      const rows = data ?? [];
      if (resource === 'subjects') return [resource, rows.map(row => ({ ...row, facultyName: row.faculty_name, createdAt: row.created_at }))] as const;
      if (resource === 'exams') return [resource, rows.map(row => ({ ...row, subjectId: row.subject_id, examAt: row.exam_at, endAt: row.end_at, sourceImportId: row.source_import_id, createdAt: row.created_at, updatedAt: row.updated_at }))] as const;
      return [resource, rows] as const;
    }));
    return NextResponse.json({ ...Object.fromEntries(results), status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await ownerClient();
    const body = await request.json() as Record<string, unknown>;
    const resource = body.resource as Resource | 'test-email';
    if (resource === 'test-email') {
      if (!user.email || !user.email_confirmed_at) return NextResponse.json({ error: 'Verify your Supabase account email before requesting a test reminder.' }, { status: 400 });
      const resendKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM_EMAIL, appUrl = process.env.NEXT_PUBLIC_APP_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!resendKey || !from || !appUrl || !serviceKey) return NextResponse.json({ error: 'Email delivery is not configured. Ask the deployment admin to configure Resend, its verified sender, and the server-side Supabase service key.' }, { status: 503 });
      const { data: allowed, error: limitError } = await client.rpc('claim_exam_test_email');
      if (limitError) throw limitError;
      if (!allowed) return NextResponse.json({ error: 'A test email was requested recently. Try again in one hour.' }, { status: 429 });
      const content = buildReminderEmail({ subject: 'AURA test', examType: 'Reminder delivery test', examAt: new Date(Date.now() + 86_400_000).toISOString(), timezone: 'UTC', topics: [], examUrl: appUrl, preferencesUrl: appUrl });
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `aura-test/${user.id}/${Math.floor(Date.now() / 3_600_000)}` }, body: JSON.stringify({ from, to: [user.email], subject: 'AURA exam reminder test', ...content }), signal: AbortSignal.timeout(8_000) });
      const result = await response.json().catch(() => ({}));
      const messageId = response.ok && typeof result.id === 'string' ? result.id : null;
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await admin.from('reminder_delivery_logs').insert({ user_id: user.id, status: response.ok ? 'accepted' : 'failed', attempt: 1, provider_message_id: messageId, diagnostic: response.ok ? 'Test reminder accepted by provider.' : `Test email provider returned HTTP ${response.status}.` });
      return response.ok ? NextResponse.json({ accepted: true, messageId }) : NextResponse.json({ error: `Email provider returned HTTP ${response.status}.` }, { status: 502 });
    }
    if (!(resource in TABLES) || resource === 'history') return NextResponse.json({ error: 'Choose a valid resource.' }, { status: 400 });

    if (resource === 'preferences') {
      const offsets = Array.isArray(body.offsets_minutes) ? body.offsets_minutes.filter(value => DEFAULT_REMINDER_OFFSETS.includes(value as never)) : DEFAULT_REMINDER_OFFSETS;
      const subjectIds = Array.isArray(body.selected_subject_ids) ? [...new Set(body.selected_subject_ids.filter(value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)))] as string[] : [];
      if (subjectIds.length) {
        const { data: owned, error: ownershipError } = await client.from('exam_subjects').select('id').eq('user_id', user.id).in('id', subjectIds);
        if (ownershipError) throw ownershipError;
        if (owned?.length !== subjectIds.length) return NextResponse.json({ error: 'One or more selected reminder subjects are not in your account.' }, { status: 403 });
      }
      const payload = { user_id: user.id, enabled: body.enabled === true, offsets_minutes: offsets, all_subjects: body.all_subjects !== false, selected_subject_ids: subjectIds, daily_digest: body.daily_digest === true, timezone: typeof body.timezone === 'string' ? body.timezone.slice(0, 100) : 'UTC', include_notes: body.include_notes === true, updated_at: new Date().toISOString() };
      const { data, error } = await client.from(TABLES.preferences).upsert(payload, { onConflict: 'user_id' }).select().single();
      if (error) throw error;
      await syncAllReminders(client, user.id, payload);
      return NextResponse.json(data);
    }

    if (resource === 'imports') {
      if (typeof body.source_name !== 'string' || typeof body.file_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.file_sha256) || !Array.isArray(body.parsed_data) || body.parsed_data.length > 100) return NextResponse.json({ error: 'Timetable import details are invalid.' }, { status: 400 });
      const { data, error } = await client.from(TABLES.imports).insert({ user_id: user.id, source_name: body.source_name.slice(0, 240), file_sha256: body.file_sha256, parsed_data: body.parsed_data, status: 'review' }).select().single();
      if (error?.code === '23505') return NextResponse.json({ error: 'This timetable file was already imported.' }, { status: 409 });
      if (error) throw error;
      return NextResponse.json(data, { status: 201 });
    }

    if (resource === 'sessions' && Array.isArray(body.items)) {
      if (body.items.length > 100) return NextResponse.json({ error: 'A study plan can contain at most 100 sessions.' }, { status: 400 });
      const rows = body.items.map(item => item && typeof item === 'object' ? validatePayload('sessions', item as Record<string, unknown>, user.id) : null);
      if (rows.some(row => row === null)) return NextResponse.json({ error: 'One or more study sessions are invalid.' }, { status: 400 });
      const validRows = rows.filter((row): row is Record<string, unknown> => row !== null);
      const { data, error } = await client.from(TABLES.sessions).insert(validRows).select();
      if (error) throw error;
      return NextResponse.json(data, { status: 201 });
    }

    const payload = validatePayload(resource, body, user.id);
    if (!payload) return NextResponse.json({ error: 'Check the required fields and try again.' }, { status: 400 });
    if (resource === 'subjects') {
      const { data: existing, error } = await client.from(TABLES.subjects).select('*').eq('user_id', user.id).ilike('name', String(payload.name).replace(/[%,_]/g, '\\$&')).limit(1);
      if (error) throw error;
      const same = existing?.find(item => item.name.trim().toLocaleLowerCase() === String(payload.name).toLocaleLowerCase());
      if (same) return NextResponse.json(same, { status: 200 });
    }
    if (resource === 'exams' && typeof payload.source_import_id === 'string') {
      const { data: source, error: sourceError } = await client.from('timetable_imports').select('id').eq('id', payload.source_import_id).eq('user_id', user.id).maybeSingle();
      if (sourceError) throw sourceError;
      if (!source) return NextResponse.json({ error: 'This timetable import does not belong to your account.' }, { status: 403 });
      const { data: existing, error } = await client.from('exams').select('*').eq('user_id', user.id).eq('source_import_id', payload.source_import_id).eq('subject_id', payload.subject_id).eq('exam_at', payload.exam_at).ilike('title', String(payload.title).replace(/[%,_]/g, '\\$&')).limit(1);
      if (error) throw error;
      if (existing?.length) return NextResponse.json(existing[0], { status: 200 });
    }
    if (resource === 'topics') {
      const { data: existing, error } = await client.from('exam_topics').select('*').eq('user_id', user.id).eq('exam_id', payload.exam_id);
      if (error) throw error;
      const same = existing?.find(item => item.title.trim().toLocaleLowerCase() === String(payload.title).toLocaleLowerCase());
      if (same) return NextResponse.json(same, { status: 200 });
    }
    const { data, error } = await client.from(TABLES[resource]).insert(payload).select().single();
    if (error) throw error;
    if (resource === 'exams') await syncExamReminders(client, user.id, data);
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { client, user } = await ownerClient();
    const body = await request.json() as Record<string, unknown>;
    const resource = body.resource as Resource;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id || !(resource in TABLES) || resource === 'history' || resource === 'preferences') return NextResponse.json({ error: 'Choose a valid record.' }, { status: 400 });
    if (resource === 'imports') {
      if (body.status !== 'confirmed' && body.status !== 'discarded') return NextResponse.json({ error: 'Choose a valid import status.' }, { status: 400 });
      const { data, error } = await client.from(TABLES.imports).update({ status: body.status }).eq('id', id).eq('user_id', user.id).select().single();
      if (error) throw error;
      return NextResponse.json(data);
    }
    const payload = validatePayload(resource, body, user.id, true);
    if (!payload) return NextResponse.json({ error: 'Check the fields and try again.' }, { status: 400 });
    if (resource === 'exams' && typeof payload.source_import_id === 'string') {
      const { data: source, error: sourceError } = await client.from('timetable_imports').select('id').eq('id', payload.source_import_id).eq('user_id', user.id).maybeSingle();
      if (sourceError) throw sourceError;
      if (!source) return NextResponse.json({ error: 'This timetable import does not belong to your account.' }, { status: 403 });
    }
    const { data, error } = await client.from(TABLES[resource]).update(payload).eq('id', id).eq('user_id', user.id).select().single();
    if (error) throw error;
    if (resource === 'exams') await syncExamReminders(client, user.id, data);
    return NextResponse.json(data);
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const { client, user } = await ownerClient();
    const body = await request.json() as { resource?: Resource; id?: string };
    if (!body.id || !body.resource || !(body.resource in TABLES) || body.resource === 'history' || body.resource === 'preferences') return NextResponse.json({ error: 'Choose a valid record.' }, { status: 400 });
    const { error } = await client.from(TABLES[body.resource]).delete().eq('id', body.id).eq('user_id', user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

function validatePayload(resource: Resource, body: Record<string, unknown>, userId: string, partial = false): Record<string, unknown> | null {
  if (resource === 'subjects') {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120) return null;
    return { user_id: userId, name: body.name.trim(), code: typeof body.code === 'string' ? body.code.slice(0, 40) : '', semester: typeof body.semester === 'string' ? body.semester.slice(0, 80) : '', faculty_name: typeof body.faculty_name === 'string' ? body.faculty_name.slice(0, 120) : null, notes: typeof body.notes === 'string' ? body.notes.slice(0, 4000) : '' };
  }
  if (resource === 'exams') {
    if ((!partial || body.subject_id !== undefined) && (typeof body.subject_id !== 'string' || !body.subject_id)) return null;
    if ((!partial || body.title !== undefined) && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160)) return null;
    if ((!partial || body.exam_at !== undefined) && (typeof body.exam_at !== 'string' || !Number.isFinite(Date.parse(body.exam_at)))) return null;
    const timezone = typeof body.timezone === 'string' ? body.timezone.slice(0, 100) : 'UTC';
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { return null; }
    const endAt = typeof body.end_at === 'string' && Number.isFinite(Date.parse(body.end_at)) ? body.end_at : null;
    const startAt = typeof body.exam_at === 'string' ? body.exam_at : '';
    if (endAt && startAt && Date.parse(endAt) <= Date.parse(startAt)) return null;
    return { user_id: userId, subject_id: body.subject_id, title: typeof body.title === 'string' ? body.title.trim().slice(0, 160) : undefined, exam_at: body.exam_at, timezone, end_at: endAt, venue: typeof body.venue === 'string' ? body.venue.slice(0, 240) : null, instructions: typeof body.instructions === 'string' ? body.instructions.slice(0, 4000) : null, notes: typeof body.notes === 'string' ? body.notes.slice(0, 4000) : '', status: body.status === 'cancelled' ? 'cancelled' : 'scheduled', source_import_id: typeof body.source_import_id === 'string' ? body.source_import_id : null, updated_at: new Date().toISOString() };
  }
  if (resource === 'topics') {
    if (typeof body.exam_id !== 'string' || (!partial || body.title !== undefined) && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 240)) return null;
    return { user_id: userId, exam_id: body.exam_id, title: typeof body.title === 'string' ? body.title.trim() : undefined, completed: body.completed === true, source: ['manual', 'timetable', 'ai'].includes(String(body.source)) ? body.source : 'manual', position: Number.isInteger(body.position) ? body.position : 0 };
  }
  if (resource === 'sessions') {
    if (typeof body.exam_id !== 'string' || typeof body.session_at !== 'string' || !Number.isFinite(Date.parse(body.session_at)) || typeof body.title !== 'string' || !body.title.trim()) return null;
    const duration = Number(body.duration_minutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 240) return null;
    return { user_id: userId, exam_id: body.exam_id, topic_id: typeof body.topic_id === 'string' ? body.topic_id : null, session_at: body.session_at, duration_minutes: duration, completed: body.completed === true, title: body.title.trim().slice(0, 240) };
  }
  return null;
}

async function syncAllReminders(client: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string, preferences: Record<string, unknown>) {
  const { data: exams, error } = await client.from('exams').select('*').eq('user_id', userId);
  if (error) throw error;
  for (const exam of exams ?? []) await syncExamReminders(client, userId, exam, preferences);
}

async function syncExamReminders(client: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string, exam: Record<string, unknown>, supplied?: Record<string, unknown>) {
  const { data: preferences, error: prefError } = supplied ? { data: supplied, error: null } : await client.from('reminder_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (prefError) throw prefError;
  const { error: cancelError } = await client.from('scheduled_reminders').update({ status: 'cancelled', locked_until: null }).eq('exam_id', exam.id).eq('user_id', userId).in('status', ['pending', 'sending']);
  if (cancelError) throw cancelError;
  const selectedSubjects = Array.isArray(preferences?.selected_subject_ids) ? preferences.selected_subject_ids as string[] : [];
  if (!preferences?.enabled || preferences.all_subjects === false && !selectedSubjects.includes(String(exam.subject_id)) || exam.status !== 'scheduled' || Date.parse(String(exam.exam_at)) <= Date.now()) return;
  const offsets = Array.isArray(preferences.offsets_minutes) ? preferences.offsets_minutes as number[] : [];
  const rows = reminderTimes(String(exam.exam_at), offsets as never).map(item => ({ user_id: userId, exam_id: exam.id, reminder_kind: String(item.offset), due_at: item.dueAt, exam_updated_at: String(exam.updated_at) }));
  for (const row of rows) {
    const { data: existing, error: lookupError } = await client.from('scheduled_reminders').select('id,status').eq('exam_id', row.exam_id).eq('reminder_kind', row.reminder_kind).eq('exam_updated_at', row.exam_updated_at).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing?.status === 'cancelled') {
      const { error } = await client.from('scheduled_reminders').update({ due_at: row.due_at, status: 'pending', attempts: 0, next_attempt_at: null, locked_until: null, last_error: null, sent_at: null }).eq('id', existing.id).eq('user_id', userId);
      if (error) throw error;
    } else if (!existing) {
      const { error } = await client.from('scheduled_reminders').insert(row);
      if (error) throw error;
    }
  }
}
