import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStudyPlan, localExamTimeToUtc, parseCsv, parseUnambiguousDate, reminderTimes, retryAt, validateTimetableFile } from '../lib/exam-planner.ts';
import { buildReminderEmail, classifyEmailFailure } from '../lib/exam-email.ts';
import { parseXlsxRows } from '../lib/xlsx-core.ts';
import { strToU8, zipSync } from 'fflate';

test('validates timetable extension, MIME, content size, and empty files', () => {
  assert.equal(validateTimetableFile({ name: 'schedule.csv', type: 'text/csv', size: 20 }), null);
  assert.equal(validateTimetableFile({ name: 'scan.png', type: 'image/png', size: 20 }), null);
  assert.match(validateTimetableFile({ name: 'bad.pdf', type: 'image/png', size: 10 }), /does not match/);
  assert.match(validateTimetableFile({ name: 'book.xls', size: 100 }), /Upload a PDF/);
  assert.match(validateTimetableFile({ name: 'empty.pdf', size: 0 }), /empty/);
  assert.match(validateTimetableFile({ name: 'large.pdf', size: 10 * 1024 * 1024 + 1 }), /10 MB/);
});

test('parses CSV quoting, embedded commas, and rejects malformed quoting', () => {
  assert.deepEqual(parseCsv('Subject,Date,Venue\r\n"Math, Applied",2026-12-01,"Hall, A"'), [['Subject', 'Date', 'Venue'], ['Math, Applied', '2026-12-01', 'Hall, A']]);
  assert.throws(() => parseCsv('Subject,Date\n"Math,2026-12-01'), /unclosed/);
});

test('parses XLSX shared strings, sparse columns, and Excel date serials', () => {
  const workbook = zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="Exams" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Subject</t></si><si><t>Exam date</t></si><si><t>Data Structures</t></si></sst>'),
    'xl/styles.xml': strToU8('<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" s="1"><v>46357</v></c></row></sheetData></worksheet>')
  });
  assert.deepEqual(parseXlsxRows(workbook), [['Subject', '', 'Exam date'], ['Data Structures', '', '2026-12-01']]);
  assert.throws(() => parseXlsxRows(strToU8('not a workbook')), /XLSX ZIP/);
});

test('marks ambiguous dates and rejects invalid calendar dates', () => {
  assert.deepEqual(parseUnambiguousDate('2026-12-01'), { date: '2026-12-01', needsReview: false });
  assert.deepEqual(parseUnambiguousDate('03/04/26'), { date: null, needsReview: true });
  assert.deepEqual(parseUnambiguousDate('2026-02-30'), { date: null, needsReview: true });
  assert.deepEqual(parseUnambiguousDate('12/04'), { date: null, needsReview: true });
});

test('converts timezone local time and flags DST gaps and overlaps', () => {
  assert.equal(localExamTimeToUtc('2026-06-10', '09:00', 'Asia/Kolkata').iso, '2026-06-10T03:30:00.000Z');
  assert.equal(localExamTimeToUtc('2026-03-08', '02:30', 'America/New_York').needsReview, true);
  assert.equal(localExamTimeToUtc('2026-11-01', '01:30', 'America/New_York').needsReview, true);
});

test('schedules only future reminder offsets and distributes estimates over remaining topics', () => {
  const exam = { id: 'e', subjectId: 's', title: 'Midterm', examAt: '2026-12-20T09:00:00Z', timezone: 'UTC', endAt: null, venue: null, instructions: null, status: 'scheduled', createdAt: '', updatedAt: '' };
  const dates = reminderTimes(exam.examAt, [10080, 120, 1440]);
  assert.equal(dates.length, 3);
  assert.equal(dates[0].offset, 10080);
  const plan = createStudyPlan(exam, [{ id: 't1', title: 'Trees', completed: false, source: 'manual', position: 0 }, { id: 't2', title: 'Graphs', completed: true, source: 'manual', position: 1 }], 90, 30, new Date('2026-12-17T10:00:00Z'));
  assert.ok(plan.length > 0);
  assert.ok(plan.every(session => session.topicIds[0] === 't1' && session.estimated));
  assert.deepEqual(createStudyPlan(exam, [], 90, 30), []);
});

test('email content escapes imported values and includes plain text and links', () => {
  const message = buildReminderEmail({ subject: '<Math>', examType: 'Final', examAt: '2026-12-01T09:00:00Z', timezone: 'UTC', venue: 'Hall & A', topics: [{ title: '<script>', completed: false }], examUrl: 'https://aura.example/#exam', preferencesUrl: 'https://aura.example/#reminders' });
  assert.match(message.html, /&lt;Math&gt;/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.text, /Hall & A/);
  assert.match(message.html, /manage exam reminder preferences/);
});

test('classifies provider retries and bounds exponential backoff', () => {
  assert.equal(classifyEmailFailure(429).temporary, true);
  assert.equal(classifyEmailFailure(503).temporary, true);
  assert.equal(classifyEmailFailure(401).temporary, false);
  assert.equal(retryAt(1, 0), new Date(60_000).toISOString());
  assert.equal(retryAt(5, 0), null);
});

test('migration has owner RLS, duplicate import protection, and atomic reminder claiming', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261028000000_create_exam_planner.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /auth\.uid\(\).*user_id/s);
  assert.match(sql, /unique \(user_id, file_sha256\)/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /claim_due_exam_reminders/i);
});

test('email endpoints require a cron secret and derive recipients from verified auth users', async () => {
  const route = await readFile(new URL('../app/api/cron/exam-reminders/route.ts', import.meta.url), 'utf8');
  assert.match(route, /authorization.*Bearer/i);
  assert.match(route, /email_confirmed_at/);
  assert.match(route, /getUserById/);
  assert.match(route, /Idempotency-Key/);
  assert.doesNotMatch(route, /body\.recipient|body\.to\b/);
});
