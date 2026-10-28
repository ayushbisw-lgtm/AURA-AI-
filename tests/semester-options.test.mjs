import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSemester, DEFAULT_SEMESTER_NAMES, getSemesterOptions } from '../lib/semester-options.ts';

test('offers Semester 1 through Semester 8 by default', () => {
  assert.deepEqual(getSemesterOptions([]).map(option => option.name), DEFAULT_SEMESTER_NAMES);
});

test('loads saved semesters and avoids duplicate names', () => {
  const saved = [{ id: 'saved-1', name: 'Semester 2', startDate: '', endDate: '', createdAt: '' }, { id: 'custom', name: 'Fall 2026', startDate: '', endDate: '', createdAt: '' }];
  const options = getSemesterOptions(saved);
  assert.equal(options.find(option => option.name === 'Semester 2')?.id, 'saved-1');
  assert.equal(options.filter(option => option.name === 'Semester 2').length, 1);
  assert.ok(options.some(option => option.name === 'Fall 2026'));
});

test('creates a custom semester record for persistence', () => {
  const semester = { id: 'custom', name: 'Fall 2026', startDate: '2026-08-01', endDate: '2026-12-15', createdAt: 'now' };
  assert.ok(getSemesterOptions([semester]).some(option => option.id === 'custom' && option.name === 'Fall 2026'));
});

test('default semester selections resolve to a persistable semester record', () => {
  const option = getSemesterOptions([]).find(item => item.name === 'Semester 4');
  assert.ok(option);
  const selected = createDefaultSemester(option.name, 'semester-4');
  assert.equal(selected.name, option.name);
  assert.equal(selected.id, 'semester-4');
});
