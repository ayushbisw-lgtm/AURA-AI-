import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildReminderEmail, classifyEmailFailure } from '@/lib/exam-email';
import { retryAt } from '@/lib/exam-planner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type ReminderJob = { id: string; user_id: string; exam_id: string; attempts: number; reminder_kind: string; exam_updated_at: string };

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!url || !serviceKey || !resendKey || !from || !appUrl) return NextResponse.json({ error: 'Reminder delivery configuration is incomplete.' }, { status: 503 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) as SupabaseClient;
  const { data: claimed, error: claimError } = await admin.rpc('claim_due_exam_reminders', { batch_size: 5 });
  if (claimError) {
    console.error('[exam-reminders] claim failed', { code: claimError.code });
    return NextResponse.json({ error: 'Could not claim due reminders.' }, { status: 500 });
  }
  let accepted = 0, retrying = 0, failed = 0, skipped = 0;
  for (const job of (claimed ?? []) as ReminderJob[]) {
    const { data: liveJob } = await admin.from('scheduled_reminders').select('*').eq('id', job.id).eq('status', 'sending').maybeSingle();
    if (!liveJob) { skipped++; continue; }
    const { data: exam } = await admin.from('exams').select('*').eq('id', job.exam_id).eq('user_id', job.user_id).maybeSingle();
    const { data: preferences } = await admin.from('reminder_preferences').select('*').eq('user_id', job.user_id).maybeSingle();
    const isOffsetEnabled = preferences?.offsets_minutes?.includes(Number(job.reminder_kind));
    const selectedSubject = preferences?.all_subjects !== false || preferences?.selected_subject_ids?.includes(exam?.subject_id);
    if (!exam || exam.status !== 'scheduled' || exam.updated_at !== job.exam_updated_at || !preferences?.enabled || !isOffsetEnabled || !selectedSubject || Date.parse(exam.exam_at) <= Date.now()) {
      await admin.from('scheduled_reminders').update({ status: 'cancelled', locked_until: null }).eq('id', job.id);
      await admin.from('reminder_delivery_logs').insert({ user_id: job.user_id, reminder_id: job.id, exam_id: job.exam_id, status: 'skipped', attempt: job.attempts, diagnostic: 'Exam or reminder settings changed before delivery.' });
      skipped++; continue;
    }
    const { data: account, error: accountError } = await admin.auth.admin.getUserById(job.user_id);
    const recipient = accountError ? null : account.user?.email;
    if (!recipient || !account.user?.email_confirmed_at) {
      await finalizeFailure(admin, job, 400, 'recipient_not_verified'); failed++; continue;
    }
    const { data: subject } = await admin.from('exam_subjects').select('name').eq('id', exam.subject_id).eq('user_id', job.user_id).maybeSingle();
    const { data: topics } = await admin.from('exam_topics').select('title,completed').eq('exam_id', exam.id).eq('user_id', job.user_id).order('position');
    const content = buildReminderEmail({ subject: subject?.name ?? 'Exam', examType: exam.title, examAt: exam.exam_at, timezone: exam.timezone, venue: exam.venue, topics: topics ?? [], examUrl: `${appUrl.replace(/\/$/, '')}/?planner=exam&examId=${encodeURIComponent(exam.id)}`, preferencesUrl: `${appUrl.replace(/\/$/, '')}/?planner=reminders` });
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `aura-exam-reminder/${job.id}` },
        body: JSON.stringify({ from, to: [recipient], subject: `AURA reminder: ${subject?.name ?? 'Exam'} ${new Date(exam.exam_at).toLocaleDateString('en', { timeZone: exam.timezone })}`, html: content.html, text: content.text }),
        signal: AbortSignal.timeout(8_000)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const classified = classifyEmailFailure(response.status, typeof result?.name === 'string' ? result.name : undefined);
        await finalizeFailure(admin, job, response.status, classified.diagnostic, classified.temporary);
        if (classified.temporary && retryAt(job.attempts)) retrying++; else failed++;
        continue;
      }
      const messageId = typeof result?.id === 'string' ? result.id : null;
      await admin.from('scheduled_reminders').update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: messageId, locked_until: null, last_error: null }).eq('id', job.id);
      await admin.from('reminder_delivery_logs').insert({ user_id: job.user_id, reminder_id: job.id, exam_id: job.exam_id, status: 'accepted', attempt: job.attempts, provider_message_id: messageId });
      accepted++;
    } catch (error) {
      const safeCode = error instanceof Error ? error.name.slice(0, 80) : 'NetworkError';
      await finalizeFailure(admin, job, 503, safeCode, true);
      if (retryAt(job.attempts)) retrying++; else failed++;
    }
  }
  return NextResponse.json({ claimed: claimed?.length ?? 0, accepted, retrying, failed, skipped });
}

async function finalizeFailure(admin: SupabaseClient, job: ReminderJob, status: number, diagnostic: string, temporary = status === 429 || status >= 500) {
  const next = temporary ? retryAt(Number(job.attempts)) : null;
  const message = diagnostic.slice(0, 500);
  await admin.from('scheduled_reminders').update({ status: next ? 'pending' : 'failed', next_attempt_at: next, locked_until: null, last_error: message }).eq('id', job.id);
  await admin.from('reminder_delivery_logs').insert({ user_id: job.user_id, reminder_id: job.id, exam_id: job.exam_id, status: next ? 'retrying' : 'failed', attempt: job.attempts, diagnostic: message });
}
