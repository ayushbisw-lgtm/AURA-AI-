'use client';

import { useEffect, useState } from 'react';
import CodeEditor from './CodeEditor';

const languages = [
  ['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['html', 'HTML'], ['css', 'CSS'], ['java', 'Java'], ['cpp', 'C++']
] as const;
const actions = [
  { id: 'explain', label: 'Explain code', icon: '⌕', description: 'Understand the structure and flow.' },
  { id: 'bugs', label: 'Find bugs', icon: '⌁', description: 'Review likely errors and edge cases.' },
  { id: 'refactor', label: 'Refactor', icon: '⤨', description: 'Improve clarity while preserving behavior.' },
  { id: 'generate', label: 'Generate code', icon: '＋', description: 'Create code from a short request.' },
  { id: 'tests', label: 'Write tests', icon: '✓', description: 'Draft tests for code you provide.' }
] as const;
type CodingAction = typeof actions[number]['id'];

function codeFromResult(value: string) {
  const fenced = value.match(/```(?:[\w+-]+)?\s*\n([\s\S]*?)```/);
  return fenced?.[1]?.trim() || value.trim();
}

export default function CodingWorkspace() {
  const [language, setLanguage] = useState<string>('typescript');
  const [code, setCode] = useState('');
  const [instruction, setInstruction] = useState('');
  const [action, setAction] = useState<CodingAction>('explain');
  const [result, setResult] = useState('');
  const [resultModel, setResultModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [providerStatus, setProviderStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [modelName, setModelName] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/health', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!controller.signal.aborted) {
        setProviderStatus(response.ok && data.ok ? 'online' : 'offline');
        if (typeof data.model === 'string') setModelName(data.model);
      }
    }).catch(() => { if (!controller.signal.aborted) setProviderStatus('offline'); });
    return () => controller.abort();
  }, []);

  async function runAction(selected = action) {
    setError(''); setNotice(''); setBusy(true); setAction(selected); setResult(''); setResultModel('');
    try {
      const response = await fetch('/api/coding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: selected, language, code, instruction })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The coding request failed.');
      if (typeof data.message !== 'string') throw new Error('The AI returned an unexpected response.');
      setResult(data.message); setResultModel(typeof data.model === 'string' ? data.model : '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not reach the configured AI provider.');
    } finally { setBusy(false); }
  }

  async function copyResult() {
    try { await navigator.clipboard.writeText(result); setNotice('AI result copied.'); }
    catch { setError('Clipboard access is unavailable. Select and copy the result manually.'); }
  }

  const requiresCode = action !== 'generate';
  const canSubmit = !busy && (action === 'generate' ? Boolean(instruction.trim()) : Boolean(code.trim()));

  return <div className="module-page coding-page">
    <div className="module-heading"><div><span className="eyebrow">LOCAL AI · NO CODE EXECUTION</span><h2>Coding tools</h2><p>Explain, review, refactor, or draft code with AURA. Nothing is run on this machine.</p></div><span className={`coding-model-chip ${providerStatus}`}><i/>{providerStatus === 'checking' ? 'Checking AI' : providerStatus === 'online' ? `Ollama · ${modelName}` : 'Ollama offline'}</span></div>
    {error && <div className="module-alert error" role="alert">{error}</div>}{notice && <div className="module-alert success" role="status">{notice}</div>}
    <div className="coding-toolbar module-card"><div><label htmlFor="coding-language">Language</label><select id="coding-language" value={language} onChange={event => setLanguage(event.target.value)}>{languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><span>Max code input: 20,000 characters</span></div>
    <div className="coding-workbench">
      <section className="module-card coding-editor-card"><div className="coding-card-head"><div><span className="coding-dot"/><strong>Editor</strong><small>{language}</small></div><span>{code.length.toLocaleString()} / 20,000</span></div><CodeEditor value={code} onChange={value => setCode(value.slice(0, 20_000))} language={language}/>
        <label className="coding-instruction-label" htmlFor="coding-instruction">{action === 'generate' ? 'Describe the code you need' : 'Additional instructions (optional)'}</label>
        <textarea id="coding-instruction" className="coding-instruction" rows={2} maxLength={1000} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder={action === 'generate' ? 'e.g. Create a typed debounce helper with a short usage example' : 'Add any context or constraints for AURA…'}/>
        <div className="coding-action-list" aria-label="Coding actions">{actions.map(item => <button className={`coding-action ${action === item.id ? 'active' : ''}`} key={item.id} onClick={() => setAction(item.id)} aria-pressed={action === item.id} title={item.description}><span>{item.icon}</span>{item.label}</button>)}</div>
        <div className="coding-submit-row"><p>{requiresCode ? 'Add code to the editor to continue.' : 'Generated code will be returned separately below.'}</p><button className="module-button primary" disabled={!canSubmit} onClick={() => void runAction()}>{busy ? 'Working…' : actions.find(item => item.id === action)?.label}</button></div>
      </section>
      <section className="module-card coding-result-card" aria-live="polite"><div className="coding-card-head"><div><span className="result-spark">✦</span><strong>AURA result</strong></div>{resultModel && <small>{resultModel}</small>}</div>
        {busy ? <div className="coding-result-empty"><span className="coding-spinner"/><strong>AURA is reviewing your request</strong><p>The code is sent to the configured model. It is not executed.</p></div> : result ? <><div className="coding-result-actions"><button onClick={() => void copyResult()}>Copy result</button>{['generate', 'refactor', 'tests'].includes(action) && <button onClick={() => { setCode(codeFromResult(result).slice(0, 20_000)); setNotice('AI code inserted into the editor. Review it before use.'); }}>Insert code into editor</button>}</div><pre className="coding-output">{result}</pre></> : <div className="coding-result-empty"><span className="result-spark">✦</span><strong>Your AI result will appear here</strong><p>Choose an action to explain, review, refactor, generate code, or draft tests.</p></div>}
      </section>
    </div>
  </div>;
}
