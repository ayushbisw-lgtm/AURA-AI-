export type MarkdownResponseBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'rule' }
  | { type: 'code'; code: string; language: string; languageKey: string };

const LANGUAGE_NAMES: Record<string, { label: string; key: string }> = {
  ts: { label: 'TypeScript', key: 'typescript' }, typescript: { label: 'TypeScript', key: 'typescript' }, tsx: { label: 'TSX', key: 'typescript' },
  js: { label: 'JavaScript', key: 'javascript' }, javascript: { label: 'JavaScript', key: 'javascript' }, jsx: { label: 'JSX', key: 'javascript' },
  py: { label: 'Python', key: 'python' }, python: { label: 'Python', key: 'python' },
  html: { label: 'HTML', key: 'html' }, css: { label: 'CSS', key: 'css' }, json: { label: 'JSON', key: 'javascript' },
  java: { label: 'Java', key: 'java' }, cpp: { label: 'C++', key: 'cpp' }, 'c++': { label: 'C++', key: 'cpp' },
  c: { label: 'C', key: 'c' }, sh: { label: 'Shell', key: 'bash' }, bash: { label: 'Bash', key: 'bash' }, shell: { label: 'Shell', key: 'bash' },
  sql: { label: 'SQL', key: 'sql' }, rust: { label: 'Rust', key: 'rust' }, go: { label: 'Go', key: 'go' },
  yaml: { label: 'YAML', key: 'yaml' }, yml: { label: 'YAML', key: 'yaml' }, toml: { label: 'TOML', key: 'toml' },
  text: { label: 'Text', key: 'javascript' }, plaintext: { label: 'Text', key: 'javascript' },
};

export function normalizeCodeLanguage(info: string): { label: string; key: string } {
  const raw = info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!raw) return { label: 'Code', key: 'javascript' };
  return LANGUAGE_NAMES[raw] ?? { label: raw.slice(0, 24).replace(/(^|-|_)([a-z])/g, (_match, separator: string, letter: string) => `${separator ? ' ' : ''}${letter.toUpperCase()}`), key: raw };
}

const isListLine = (line: string) => /^\s*(?:[-+*]\s+|\d+[.)]\s+)/.test(line);
const isSpecialLine = (line: string) => /^\s*```/.test(line) || /^\s{0,3}#{1,6}\s+/.test(line) || /^\s*>/.test(line) || isListLine(line) || /^\s*(?:(?:-{3,})|(?:\*{3,})|(?:_{3,}))\s*$/.test(line);

export function parseMarkdownResponse(markdown: string): MarkdownResponseBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownResponseBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }

    const fence = line.match(/^\s*```\s*([^`]*)$/);
    if (fence) {
      const language = normalizeCodeLanguage(fence[1]);
      const codeLines: string[] = [];
      index++;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) codeLines.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push({ type: 'code', code: codeLines.join('\n').replace(/\n+$/, ''), language: language.label, languageKey: language.key });
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index++;
      continue;
    }

    if (/^\s*(?:(?:-{3,})|(?:\*{3,})|(?:_{3,}))\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      index++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quoted.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', text: quoted.join('\n') });
      continue;
    }

    if (isListLine(line)) {
      const first = line.match(/^\s*(\d+)[.)]\s+/);
      const ordered = Boolean(first);
      const items: string[] = [];
      while (index < lines.length && isListLine(lines[index])) {
        const item = lines[index++].replace(/^\s*(?:[-+*]\s+|\d+[.)]\s+)/, '');
        items.push(item);
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index++;
    while (index < lines.length && lines[index].trim() && !isSpecialLine(lines[index])) paragraph.push(lines[index++].trim());
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}
