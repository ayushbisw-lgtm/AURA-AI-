import test from 'node:test';
import assert from 'node:assert/strict';
import { planAttendance, summarizeAttendance, validateSubject } from '../lib/attendance.ts';
import { readFile } from 'node:fs/promises';

const record = (status) => ({ id: crypto.randomUUID(), subject_id: 'subject', session_date: '2026-10-27', session_number: 1, status, notes: null });

test('attendance summary excludes cancelled sessions and handles no classes', () => {
  assert.deepEqual(summarizeAttendance([]), { total: 0, conducted: 0, present: 0, absent: 0, cancelled: 0, percentage: null });
  assert.deepEqual(summarizeAttendance([record('present'), record('absent'), record('cancelled')]), { total: 3, conducted: 2, present: 1, absent: 1, cancelled: 1, percentage: 50 });
});

test('planner calculates future classes, misses, reached and unreachable targets', () => {
  assert.deepEqual(planAttendance(0, 0, 75), { minimumToReach: 1, additionalMisses: 0, reachable: true });
  assert.deepEqual(planAttendance(6, 10, 75), { minimumToReach: 6, additionalMisses: 0, reachable: true });
  assert.deepEqual(planAttendance(8, 10, 75), { minimumToReach: 0, additionalMisses: 0, reachable: true });
  assert.equal(planAttendance(9, 10, 100).minimumToReach, null);
  assert.equal(planAttendance(10, 10, 100).minimumToReach, 0);
});

test('subject validation rejects invalid fields and accepts valid details', () => {
  assert.throws(() => validateSubject({ name: '  ', code: '', semester: '3', target: 75 }));
  assert.throws(() => validateSubject({ name: 'Math', code: '', semester: '3', target: 101 }));
  assert.doesNotThrow(() => validateSubject({ name: 'Math', code: 'MTH-1', semester: 'Semester 3', target: 75 }));
});

test('attendance schema applies owner-scoped RLS and prevents duplicate sessions', async () => {
  const schema = await readFile(new URL('../supabase/migrations/20261027000000_create_attendance_tracker.sql', import.meta.url), 'utf8');
  assert.match(schema, /alter table public\.attendance_subjects enable row level security/i);
  assert.match(schema, /alter table public\.attendance_sessions enable row level security/i);
  assert.match(schema, /auth\.uid\(\)\) = user_id/i);
  assert.match(schema, /unique \(subject_id, session_date, session_number\)/i);
  assert.match(schema, /attendance_session_owner_fk/i);
});
