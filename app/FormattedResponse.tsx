'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { highlighted } from './CodeEditor';
import { parseMarkdownResponse } from '@/lib/chat-markdown';

function safeLinkTarget(value: string): string | null {
  const target = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(target) || /^\/(?!\/)/.test(target) || target.startsWith('#') || target.startsWith('./') || target.startsWith('../')) return target;
  return null;
}

function inlineMarkdown(text: string, prefix: string): ReactNode[] {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;
  const result: ReactNode[] = [];
  let last = 0;
  let index = 0;

  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const offset = match.index ?? 0;
    if (offset > last) result.push(text.slice(last, offset));
    const key = `${prefix}-${index++}`;
    if (token.startsWith('`')) result.push(<code className="response-inline-code" key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**')) result.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('~~')) result.push(<del key={key}>{token.slice(2, -2)}</del>);
    else if (token.startsWith('*')) result.push(<em key={key}>{token.slice(1, -1)}</em>);
    else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link ? safeLinkTarget(link[2]) : null;
      if (link && href) result.push(<a href={href} key={key} rel="noreferrer" target="_blank">{link[1]}</a>);
      else result.push(token);
    }
    last = offset + token.length;
  }
  if (last < text.length) result.push(text.slice(last));
  return result;
}

function CodePanel({ code, language, languageKey, copyText, copyLabel }: { code: string; language: string; languageKey: string; copyText: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    if (!copied && !copyError) return;
    const timer = window.setTimeout(() => { setCopied(false); setCopyError(false); }, 1600);
    return () => window.clearTimeout(timer);
  }, [copied, copyError]);

  async function copyResponse() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
    } catch {
      setCopyError(true);
    }
  }

  return <section className="response-code-panel" aria-label={`${language} code response`}>
    <header className="response-code-header"><span>{language}</span><button type="button" onClick={() => void copyResponse()} aria-label={copyError ? 'Copy failed' : copied ? 'Copied response' : copyLabel}>{copyError ? 'Copy failed' : copied ? 'Copied' : copyLabel}</button></header>
    <pre className="response-code"><code>{highlighted(code, languageKey)}</code></pre>
  </section>;
}

export default function FormattedResponse({ content }: { content: string }) {
  if (!content.trim()) return <p className="response-empty">AURA returned an empty response. Please try again.</p>;
  const blocks = parseMarkdownResponse(content);
  const isCodeOnly = blocks.length === 1 && blocks[0].type === 'code';

  return <div className="formatted-response">
    {blocks.map((block, index) => {
      const key = `response-${index}`;
      if (block.type === 'code') return <CodePanel key={key} code={block.code} language={block.language} languageKey={block.languageKey} copyText={isCodeOnly ? block.code : content} copyLabel={isCodeOnly ? 'Copy code' : 'Copy response'} />;
      if (block.type === 'heading') {
        const Heading = `h${Math.min(block.level, 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
        return <Heading className="response-heading" key={key}>{inlineMarkdown(block.text, key)}</Heading>;
      }
      if (block.type === 'list') {
        const List = block.ordered ? 'ol' : 'ul';
        return <List className="response-list" key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inlineMarkdown(item, `${key}-${itemIndex}`)}</li>)}</List>;
      }
      if (block.type === 'quote') return <blockquote className="response-quote" key={key}>{block.text.split('\n').map((line, lineIndex) => <span key={`${key}-${lineIndex}`}>{inlineMarkdown(line, `${key}-${lineIndex}`)}{lineIndex < block.text.split('\n').length - 1 && <br/>}</span>)}</blockquote>;
      if (block.type === 'rule') return <hr className="response-rule" key={key}/>;
      return <p className="response-paragraph" key={key}>{inlineMarkdown(block.text, key)}</p>;
    })}
  </div>;
}
