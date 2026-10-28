import { escapeHtml } from './exam-planner.ts';

export type ReminderEmail = { subject: string; examType: string; examAt: string; timezone: string; venue?: string | null; topics: { title: string; completed: boolean }[]; examUrl: string; preferencesUrl: string };

export function buildReminderEmail(input: ReminderEmail) {
  const when = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short', timeZone: input.timezone }).format(new Date(input.examAt));
  const complete = input.topics.filter(topic => topic.completed).length;
  const topicList = input.topics.length
    ? `<ul>${input.topics.map(topic => `<li>${topic.completed ? '✓' : '○'} ${escapeHtml(topic.title)}</li>`).join('')}</ul>`
    : '<p>No topics were confirmed for this exam yet.</p>';
  const venue = input.venue ? `<p><strong>Venue:</strong> ${escapeHtml(input.venue)}</p>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#10121b;color:#f2f1fa;font-family:Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:28px;background:#191b28;border:1px solid #303247;border-radius:14px"><p style="color:#a9a2ff;font-weight:bold;letter-spacing:2px">✳ AURA AI · EXAM PLANNER</p><h1 style="font-size:24px">${escapeHtml(input.subject)}</h1><p>${escapeHtml(input.examType)}</p><p><strong>${escapeHtml(when)} (${escapeHtml(input.timezone)})</strong></p>${venue}<h2 style="font-size:17px">Revision checklist · ${complete}/${input.topics.length} topics complete</h2>${topicList}<p>Take a moment to review your confirmed exam details and remaining topics.</p><p><a href="${escapeHtml(input.examUrl)}" style="display:inline-block;padding:12px 18px;background:#7165dc;color:white;text-decoration:none;border-radius:8px">Open AURA</a></p><p style="font-size:12px;color:#aaa8b9">You can <a href="${escapeHtml(input.preferencesUrl)}" style="color:#bab3ff">manage exam reminder preferences</a> at any time.</p></main></body></html>`;
  const text = `AURA AI Exam Planner\n\n${input.subject} — ${input.examType}\n${when} (${input.timezone})\n${input.venue ? `Venue: ${input.venue}\n` : ''}\nRevision checklist: ${complete}/${input.topics.length} topics complete\n${input.topics.map(topic => `${topic.completed ? '[x]' : '[ ]'} ${topic.title}`).join('\n') || 'No topics confirmed.'}\n\nOpen AURA: ${input.examUrl}\nManage reminders: ${input.preferencesUrl}`;
  return { html, text };
}

export function classifyEmailFailure(status: number, code?: string) {
  const temporary = status === 429 || status >= 500 || code === 'concurrent_idempotent_requests';
  return { temporary, diagnostic: `Email provider returned HTTP ${status}${code ? ` (${code.slice(0, 80)})` : ''}.` };
}
