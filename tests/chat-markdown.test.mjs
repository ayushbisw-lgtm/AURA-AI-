import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodeLanguage, parseMarkdownResponse } from '../lib/chat-markdown.ts';

test('TypeScript, Python, and JavaScript fences retain their language labels', () => {
  const typescript = parseMarkdownResponse('```typescript\nconst answer: number = 42;\n```');
  const python = parseMarkdownResponse('```py\nprint("hello")\n```');
  const javascript = parseMarkdownResponse('```js\nconsole.log("hello");\n```');
  assert.equal(typescript[0].type, 'code');
  assert.equal(typescript[0].language, 'TypeScript');
  assert.equal(typescript[0].languageKey, 'typescript');
  assert.equal(python[0].language, 'Python');
  assert.equal(javascript[0].language, 'JavaScript');
});

test('ordinary answers remain prose and mixed Markdown keeps prose, lists, headings, and code separate', () => {
  const prose = parseMarkdownResponse('A closure keeps access to its lexical scope.');
  assert.deepEqual(prose, [{ type: 'paragraph', text: 'A closure keeps access to its lexical scope.' }]);

  const mixed = parseMarkdownResponse('# Example\n\nUse this function:\n\n```ts\nconst add = (a: number, b: number) => a + b;\n```\n\n- It adds two values.\n- It returns a number.');
  assert.deepEqual(mixed.map(block => block.type), ['heading', 'paragraph', 'code', 'list']);
  assert.equal(mixed[0].text, 'Example');
  assert.equal(mixed[2].code, 'const add = (a: number, b: number) => a + b;');
  assert.equal(mixed[3].items.length, 2);
});

test('unknown language names are preserved safely and missing tags use a neutral label', () => {
  assert.deepEqual(normalizeCodeLanguage('rust'), { label: 'Rust', key: 'rust' });
  assert.deepEqual(normalizeCodeLanguage(''), { label: 'Code', key: 'javascript' });
  assert.equal(parseMarkdownResponse('```\nraw code\n```')[0].language, 'Code');
});
