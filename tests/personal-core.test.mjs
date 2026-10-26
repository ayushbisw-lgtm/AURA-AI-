import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAndSortTasks, findRelevantMemories, localDateString, validateMemory, validateTask } from '../lib/personal-core.ts';

const memories = [
  { id: 'm1', title: 'Code preferences', content: 'Use TypeScript and concise examples.', category: 'preferences', updatedAt: '2026-01-03T00:00:00Z' },
  { id: 'm2', title: 'Study project', content: 'Building a biology flashcard app.', category: 'projects', updatedAt: '2026-01-02T00:00:00Z' }
];

const tasks = [
  { id: 'today', title: 'Read chapter', description: '', dueDate: '2026-04-10', priority: 'medium', status: 'pending', category: '', updatedAt: '2026-04-01T00:00:00Z' },
  { id: 'future', title: 'Submit report', description: 'Draft the report', dueDate: '2026-04-12', priority: 'high', status: 'pending', category: 'Work', updatedAt: '2026-04-02T00:00:00Z' },
  { id: 'late', title: 'Call tutor', description: '', dueDate: '2026-04-09', priority: 'low', status: 'pending', category: '', updatedAt: '2026-04-03T00:00:00Z' },
  { id: 'done', title: 'Review notes', description: '', dueDate: '2026-04-08', priority: 'high', status: 'completed', category: '', updatedAt: '2026-04-04T00:00:00Z' },
  { id: 'nodate', title: 'Organize desk', description: '', priority: 'low', status: 'pending', category: '', updatedAt: '2026-04-05T00:00:00Z' }
];

test('memory validation blocks credentials and enforces supported categories', () => {
  assert.match(validateMemory('Login', 'My password is not-for-storage', 'general'), /will not save/i);
  assert.match(validateMemory('API', 'api_key: sk-abcdefghijklmnop', 'projects'), /will not save/i);
  assert.match(validateMemory('', 'content', 'general'), /Title/);
  assert.equal(validateMemory('Style', 'Prefer short examples.', 'preferences'), null);
  assert.match(validateMemory('Note', 'Okay', 'unknown'), /category/i);
});

test('memory retrieval returns only keyword-relevant entries and caps results', () => {
  assert.deepEqual(findRelevantMemories('Please show TypeScript examples', memories).map(memory => memory.id), ['m1']);
  assert.equal(findRelevantMemories('weather in another city', memories).length, 0);
  assert.ok(findRelevantMemories('study project coding', memories, 99).length <= 4);
});

test('task filters handle local today, upcoming, overdue, completed, and missing dates', () => {
  assert.deepEqual(filterAndSortTasks(tasks, 'today', '', 'due', '2026-04-10').map(task => task.id), ['today']);
  assert.deepEqual(filterAndSortTasks(tasks, 'upcoming', '', 'due', '2026-04-10').map(task => task.id), ['future']);
  assert.deepEqual(filterAndSortTasks(tasks, 'overdue', '', 'due', '2026-04-10').map(task => task.id), ['late']);
  assert.deepEqual(filterAndSortTasks(tasks, 'completed', '', 'due', '2026-04-10').map(task => task.id), ['done']);
  assert.ok(filterAndSortTasks(tasks, 'all', '', 'due', '2026-04-10').some(task => task.id === 'nodate'));
});

test('task search, priority sorting, and date validation are deterministic', () => {
  assert.deepEqual(filterAndSortTasks(tasks, 'all', 'draft', 'priority', '2026-04-10').map(task => task.id), ['future']);
  assert.match(validateTask('Task', '', '2026-02-31', 'low', ''), /valid due date/i);
  assert.equal(validateTask('Task', '', '', 'high', ''), null);
  assert.equal(localDateString(new Date(2026, 0, 2)), '2026-01-02');
});
