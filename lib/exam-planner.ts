export type ExamTopic = { id: string; exam_id?: string; title: string; completed: boolean; source: 'manual' | 'timetable' | 'ai'; position: number };
export type ExamSubject = { id: string; name: string; code: string; semester: string; facultyName: string | null; notes?: string; createdAt: string };
export type PlannedExam = {
  id: string; subjectId: string; subjectName?: string; title: string; examAt: string; timezone: string;
  endAt: string | null; venue: string | null; instructions: string | null; status: 'scheduled' | 'cancelled';
  sourceImportId?: string | null; topics?: ExamTopic[]; createdAt: string; updatedAt: string;
};
export type ReminderOffset = 10080 | 4320 | 1440 | 120;
export const DEFAULT_REMINDER_OFFSETS: ReminderOffset[] = [10080, 4320, 1440, 120];
export const MAX_TIMETABLE_BYTES = 10 * 1024 * 1024;

export function validateTimetableFile(file: { name: string; type?: string; size: number }): string | null {
  if (!file.size) return 'The selected file is empty.';
  if (file.size > MAX_TIMETABLE_BYTES) return 'Timetables must be 10 MB or smaller.';
  const ext = file.name.toLowerCase().split('.').pop();
  const supported = ['pdf', 'csv', 'xlsx', 'png', 'jpg', 'jpeg'];
  if (!ext || !supported.includes(ext)) return 'Upload a PDF, CSV, JPG, or PNG timetable.';
  const expected: Record<string, string[]> = {
    pdf: ['application/pdf'], csv: ['text/csv', 'text/plain', 'application/vnd.ms-excel'], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    png: ['image/png'], jpg: ['image/jpeg'], jpeg: ['image/jpeg']
  };
  if (file.type && !expected[ext].includes(file.type)) return 'The file type does not match its extension.';
  return null;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(cell.trim()); cell = '';
      if (row.some(value => value)) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  row.push(cell.trim());
  if (row.some(value => value)) rows.push(row);
  return rows;
}

export function parseUnambiguousDate(value: string): { date: string | null; needsReview: boolean } {
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (iso) {
    const date = new Date(`${input}T00:00:00.000Z`);
    if (!Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === input) return { date: input, needsReview: false };
    return { date: null, needsReview: true };
  }
  if (/^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(input)) return { date: null, needsReview: true };
  return { date: null, needsReview: true };
}

function localParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function localExamTimeToUtc(date: string, time: string, timeZone: string): { iso: string | null; needsReview: boolean } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { iso: null, needsReview: true };
  try {
    const target = `${date} ${time}`;
    const naive = Date.parse(`${date}T${time}:00Z`);
    const matches: number[] = [];
    for (let shift = -14; shift <= 14; shift += 0.25) {
      const candidate = naive + shift * 3_600_000;
      const parts = localParts(candidate, timeZone);
      if (`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` === target) matches.push(candidate);
    }
    const unique = [...new Set(matches)];
    return unique.length === 1 ? { iso: new Date(unique[0]).toISOString(), needsReview: false } : { iso: null, needsReview: true };
  } catch { return { iso: null, needsReview: true }; }
}

export function reminderTimes(examAt: string, offsets: ReminderOffset[]): { offset: ReminderOffset; dueAt: string }[] {
  const timestamp = Date.parse(examAt);
  if (!Number.isFinite(timestamp)) throw new Error('Exam date and time are invalid.');
  return offsets.map(offset => ({ offset, dueAt: new Date(timestamp - offset * 60_000).toISOString() })).filter(item => Date.parse(item.dueAt) > Date.now());
}

export function createStudyPlan(exam: PlannedExam, topics: ExamTopic[], dailyMinutes: number, sessionMinutes: number, now = new Date(), timeZone = 'UTC'): { date: string; topicIds: string[]; minutes: number; estimated: true }[] {
  const remaining = topics.filter(topic => !topic.completed);
  const minutes = Math.max(15, Math.min(240, Math.round(dailyMinutes / sessionMinutes) * sessionMinutes));
  if (!remaining.length || !Number.isFinite(dailyMinutes) || !Number.isFinite(sessionMinutes) || sessionMinutes < 5) return [];
  const today = localParts(now.getTime(), timeZone);
  const examDate = localParts(Date.parse(exam.examAt), timeZone);
  const todayMidnight = Date.parse(`${today.year}-${today.month}-${today.day}T00:00:00Z`);
  const examMidnight = Date.parse(`${examDate.year}-${examDate.month}-${examDate.day}T00:00:00Z`);
  const days = Math.max(1, Math.ceil((examMidnight - todayMidnight) / 86_400_000));
  const schedule = Array.from({ length: Math.min(days, 60) }, (_, index) => {
    const date = new Date(todayMidnight + index * 86_400_000).toISOString().slice(0, 10);
    const topic = remaining[index % remaining.length];
    return { date, topicIds: [topic.id], minutes, estimated: true as const };
  });
  return schedule;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function retryAt(attempt: number, now = Date.now()): string | null {
  if (attempt >= 5) return null;
  return new Date(now + Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1))).toISOString();
}
