import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveStudyChunks, splitStudyText, validateStudyFile } from '../lib/academic-core.ts';

test('splits long study text into overlapping chunks and retains page references', () => {
  const source = `${'Algorithms describe a repeatable process. '.repeat(35)}`;
  const chunks = splitStudyText(source, 7, 500, 80);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.page === 7));
  assert.ok(chunks.every(chunk => chunk.text.length <= 500));
  assert.ok(chunks[0].text.slice(-60).split(' ').some(word => chunks[1].text.includes(word)));
});

test('retrieves relevant chunks and filters by subject', () => {
  const documents = [
    { id: 'd1', name: 'Trees.md', subjectId: 'cs', chunks: [{ id: 'c1', text: 'Binary search trees keep values ordered for efficient lookup.', page: 3 }] },
    { id: 'd2', name: 'Chemistry.txt', subjectId: 'chem', chunks: [{ id: 'c2', text: 'A catalyst changes the rate of a chemical reaction.' }] }
  ];

  assert.equal(retrieveStudyChunks('How does binary tree lookup work?', documents, 'cs')[0]?.documentName, 'Trees.md');
  assert.deepEqual(retrieveStudyChunks('chemical reaction catalyst', documents, 'cs'), []);
});

test('validates file types and the 10 MB upload limit', () => {
  assert.equal(validateStudyFile({ name: 'notes.md', size: 120 }), null);
  assert.match(validateStudyFile({ name: 'diagram.png', size: 120 }), /PDF, TXT, or Markdown/);
  assert.match(validateStudyFile({ name: 'huge.pdf', size: 10 * 1024 * 1024 + 1 }), /10 MB/);
  assert.match(validateStudyFile({ name: 'empty.txt', size: 0 }), /empty/);
});
