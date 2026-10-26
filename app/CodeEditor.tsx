'use client';

import { type ReactNode, useMemo, useRef } from 'react';

const KEYWORDS: Record<string, string> = {
  python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
  javascript: 'async await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return static super switch this throw try typeof undefined var void while yield true',
  typescript: 'abstract any as asserts async await bigint boolean break case catch class const constructor continue debugger declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object package private protected public readonly require return set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield',
  java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new null package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false',
  cpp: 'alignas auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend if inline int long namespace new noexcept nullptr private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while',
  c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while',
  bash: 'case do done elif else esac fi for function if in select then until while coproc time [[ ]] false true',
  sql: 'add all alter and any as asc begin between by case check column constraint create cross database default delete desc distinct drop else end except exists foreign from full group having in index inner insert into is join key left like limit not null on or order outer primary references right select set table then top trigger union unique update values view when where with',
  rust: 'as async await bool break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return Self self static struct super trait true type unsafe use where while',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var false true nil',
  yaml: 'true false null yes no on off', toml: 'true false',
  html: '', css: ''
};

export function highlighted(code: string, language: string) {
  const keywordSet = new Set((KEYWORDS[language] ?? '').split(' '));
  const pattern = /(\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:[A-Za-z_$][\w$]*)\b|\b\d+(?:\.\d+)?\b|<\/?[A-Za-z][\w:.-]*|\/?>)/g;
  const parts: ReactNode[] = [];
  let previous = 0;
  for (const match of code.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > previous) parts.push(code.slice(previous, index));
    let kind = 'plain';
    if (/^(\/\/|\/\*|#|<!--)/.test(value)) kind = 'comment';
    else if (/^("|'|`)/.test(value)) kind = 'string';
    else if (/^\d/.test(value)) kind = 'number';
    else if (/^<\/?|^\/?>$/.test(value)) kind = 'tag';
    else if (keywordSet.has(value)) kind = 'keyword';
    parts.push(<span className={`code-token ${kind}`} key={`${index}-${value}`}>{value}</span>);
    previous = index + value.length;
  }
  if (previous < code.length) parts.push(code.slice(previous));
  return parts;
}

export default function CodeEditor({ value, onChange, language }: { value: string; onChange: (value: string) => void; language: string }) {
  const preRef = useRef<HTMLPreElement>(null);
  const code = useMemo(() => highlighted(value || ' ', language), [value, language]);
  return <div className="code-editor">
    <pre ref={preRef} aria-hidden="true"><code>{code}</code></pre>
    {!value && <span className="code-editor-placeholder" aria-hidden="true">Paste or type code here…</span>}
    <textarea aria-label={`${language} code editor`} spellCheck={false} autoCapitalize="off" autoCorrect="off" value={value} onChange={event => onChange(event.target.value)} onScroll={event => {
      if (preRef.current) { preRef.current.scrollTop = event.currentTarget.scrollTop; preRef.current.scrollLeft = event.currentTarget.scrollLeft; }
    }} />
  </div>;
}
