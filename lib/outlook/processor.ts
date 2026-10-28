export type GraphMessage = {
  id: string; internetMessageId?: string; subject?: string; receivedDateTime?: string; webLink?: string;
  from?: { emailAddress?: { name?: string; address?: string } }; body?: { content?: string; contentType?: string };
  hasAttachments?: boolean; importance?: string; isRead?: boolean;
};

const rules: Array<{ category: string; words: RegExp; weight: number }> = [
  { category: 'exam', words: /\b(exam(?:ination)?s?|mid[- ]?sem(?:ester)?|end[- ]?sem(?:ester)?|hall ticket|date sheet|admit card)\b/i, weight: 0.85 },
  { category: 'assignment', words: /\b(assignments?|submission deadline|submit by|coursework|lab record)\b/i, weight: 0.8 },
  { category: 'fees', words: /\b(fee payment|tuition fee|fee deadline|scholarship|fine payment)\b/i, weight: 0.78 },
  { category: 'timetable', words: /\b(class cancelled|class cancellation|timetable|room change|lecture rescheduled|schedule change)\b/i, weight: 0.82 },
  { category: 'attendance', words: /\b(attendance|shortage|academic warning|detained|debarred)\b/i, weight: 0.8 },
  { category: 'event', words: /\b(holiday|university event|registration deadline|results? announced|result declaration|convocation|fest)\b/i, weight: 0.72 },
  { category: 'administrative', words: /\b(university circular|important notice|administrative announcement|college notice|registration)\b/i, weight: 0.58 }
];

function textOnly(message: GraphMessage) {
  const content = message.body?.content ?? '';
  // Strip markup and cap in-memory parsing. Never persist this content or execute its text.
  return content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').slice(0, 30_000);
}

export function processMessage(message: GraphMessage, microsoftUserId: string) {
  const subject = (message.subject ?? '').slice(0, 998);
  const body = textOnly(message);
  const content = `${subject} ${body}`;
  const match = rules.map(rule => ({ ...rule, found: rule.words.test(content) })).find(rule => rule.found);
  const isNotice = Boolean(match);
  const dates: Array<{ value: string; uncertain: boolean }> = [];
  const iso = /\b(20\d{2}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?\b/g;
  for (const found of content.matchAll(iso)) {
    const timestamp = found[2] ? `${found[1]}T${found[2]}` : found[1];
    const value = Date.parse(timestamp);
    if (Number.isFinite(value) && dates.length < 10) dates.push({ value: new Date(value).toISOString(), uncertain: true });
  }
  const attachments = message.hasAttachments ? [{ metadataStatus: 'available_in_outlook', name: null as string | null, contentType: null as string | null }] : [];
  return {
    microsoft_user_id: microsoftUserId, message_id: message.id, internet_message_id: message.internetMessageId ?? null,
    subject, sender_name: (message.from?.emailAddress?.name ?? '').slice(0, 160), sender_address: (message.from?.emailAddress?.address ?? '').slice(0, 320),
    received_at: Number.isFinite(Date.parse(message.receivedDateTime ?? '')) ? message.receivedDateTime : new Date(0).toISOString(),
    web_link: safeOutlookLink(message.webLink), summary: null, category: isNotice ? match!.category : 'other',
    importance: isNotice && (match!.category === 'exam' || match!.category === 'attendance' || /urgent|action required/i.test(subject)) ? 'high' : 'normal',
    extracted_dates: dates, action_items: [], processing_status: dates.length ? 'review_needed' : 'summary_unavailable',
    confidence: isNotice ? match!.weight : 0.1, attachment_metadata: attachments, is_notice: isNotice,
    read_at: message.isRead ? new Date().toISOString() : null, updated_at: new Date().toISOString()
  };
}

export function safeOutlookLink(link?: string) {
  if (!link) return null;
  try { const url = new URL(link); return ['outlook.office.com', 'outlook.live.com'].includes(url.hostname) && url.protocol === 'https:' ? url.toString().slice(0, 2048) : null; } catch { return null; }
}
