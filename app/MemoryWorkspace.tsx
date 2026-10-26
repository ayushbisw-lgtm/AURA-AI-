'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearMemories, deleteMemory, loadPersonalData, saveMemory, setMemoryEnabled } from '@/lib/personal-store';
import { validateMemory } from '@/lib/personal-core';
import type { MemoryCategory, SavedMemory } from '@/lib/personal-types';

const categories: MemoryCategory[] = ['preferences', 'projects', 'study', 'general'];
const categoryLabel: Record<MemoryCategory, string> = { preferences: 'Preferences', projects: 'Projects', study: 'Study', general: 'General' };

export default function MemoryWorkspace({ userId }: { userId: string }) {
  const [memories, setMemories] = useState<SavedMemory[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<MemoryCategory>('general');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    void loadPersonalData(userId).then(data => {
      if (!current) return;
      setMemories(data.memories); setEnabled(data.memoryEnabled);
    }).catch(reason => {
      if (current) setError(reason instanceof Error ? reason.message : 'Could not load memories.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [userId]);

  const visible = useMemo(() => memories.filter(memory => {
    const matchesCategory = categoryFilter === 'all' || memory.category === categoryFilter;
    const matchesQuery = !query.trim() || `${memory.title} ${memory.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesCategory && matchesQuery;
  }), [memories, query, categoryFilter]);

  function resetForm() {
    setEditingId(null); setTitle(''); setContent(''); setCategory('general');
  }

  function beginEdit(memory: SavedMemory) {
    setEditingId(memory.id); setTitle(memory.title); setContent(memory.content); setCategory(memory.category); setError(''); setNotice('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const validationError = validateMemory(title, content, category);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const previous = memories.find(memory => memory.id === editingId);
    const memory: SavedMemory = { id: editingId ?? crypto.randomUUID(), title: title.trim(), content: content.trim(), category, createdAt: previous?.createdAt ?? now, updatedAt: now };
    try {
      await saveMemory(userId, memory);
      setMemories(current => [memory, ...current.filter(item => item.id !== memory.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      resetForm(); setNotice(editingId ? 'Memory updated.' : 'Memory saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this memory.'); }
    finally { setSaving(false); }
  }

  async function remove(memory: SavedMemory) {
    if (!window.confirm(`Delete “${memory.title}”?`)) return;
    setError(''); setNotice('');
    try {
      await deleteMemory(userId, memory.id);
      setMemories(current => current.filter(item => item.id !== memory.id));
      if (editingId === memory.id) resetForm();
      setNotice('Memory deleted.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this memory.'); }
  }

  async function clearAll() {
    if (!memories.length || !window.confirm(`Permanently clear all ${memories.length} saved memories for this account?`)) return;
    setError(''); setNotice('');
    try {
      await clearMemories(userId); setMemories([]); resetForm(); setNotice('All memories cleared.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not clear memories.'); }
  }

  async function toggleMemoryUsage() {
    setError(''); setNotice('');
    try {
      await setMemoryEnabled(userId, !enabled); setEnabled(value => !value);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save memory settings.'); }
  }

  return <div className="module-page memory-page">
    <div className="module-heading"><div><span className="eyebrow">PERSONAL CONTEXT · PRIVATE TO YOUR ACCOUNT</span><h2>Memory</h2><p>Save useful preferences and ongoing context for future conversations.</p></div><span className="module-count">{memories.length} saved</span></div>
    {error && <div className="module-alert error" role="alert">{error}</div>}{notice && <div className="module-alert success" role="status">{notice}</div>}
    <section className="module-card memory-consent">
      <div><span className={`memory-toggle-indicator ${enabled ? 'on' : ''}`} aria-hidden="true"/><div><strong>Use memories in chat</strong><p>{enabled ? 'Only saved memories that match your current question may be included.' : 'Memory use is off. Nothing from this list will be sent with chat requests.'}</p></div></div>
      <button className={`module-toggle ${enabled ? 'on' : ''}`} role="switch" aria-checked={enabled} onClick={() => void toggleMemoryUsage()}><span/></button>
    </section>
    <div className="memory-layout">
      <section className="module-card memory-list-card">
        <div className="module-section-head"><div><h3>Saved memories</h3><p>Search and organize the information you chose to keep.</p></div>{memories.length > 0 && <button className="module-button danger-quiet" onClick={() => void clearAll()}>Clear all</button>}</div>
        <div className="module-filters"><label className="module-search"><span aria-hidden="true">⌕</span><input aria-label="Search memories" placeholder="Search memories" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Filter memories by category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{categories.map(item => <option value={item} key={item}>{categoryLabel[item]}</option>)}</select></div>
        {loading ? <div className="module-empty">Loading your memories…</div> : visible.length ? <div className="memory-list">{visible.map(memory => <article className="memory-item" key={memory.id}><div className="memory-item-head"><span className={`memory-category ${memory.category}`}>{categoryLabel[memory.category]}</span><small>Updated {new Date(memory.updatedAt).toLocaleDateString()}</small></div><h4>{memory.title}</h4><p>{memory.content}</p><div className="memory-item-actions"><button onClick={() => beginEdit(memory)}>Edit</button><button className="delete-text" onClick={() => void remove(memory)}>Delete</button></div></article>)}</div> : <div className="module-empty"><span className="module-empty-icon">◈</span><strong>{memories.length ? 'No matching memories' : 'No saved memories yet'}</strong><p>{memories.length ? 'Try another search or category.' : 'Save a preference, project detail, or study note to make this space useful.'}</p></div>}
      </section>
      <section className="module-card memory-form-card">
        <div className="module-section-head"><div><h3>{editingId ? 'Edit memory' : 'Add a memory'}</h3><p>Only save details you are comfortable keeping in this browser.</p></div></div>
        <form className="module-form" onSubmit={event => void submit(event)}>
          <label>Title<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Preferred explanation style"/></label>
          <label>Category<select value={category} onChange={event => setCategory(event.target.value as MemoryCategory)}>{categories.map(item => <option value={item} key={item}>{categoryLabel[item]}</option>)}</select></label>
          <label>Memory<textarea required maxLength={1200} rows={5} value={content} onChange={event => setContent(event.target.value)} placeholder="Add a useful preference or context…"/><small>{content.length}/1,200 characters · passwords and keys are blocked</small></label>
          <div className="module-form-actions"><button className="module-button primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Save memory'}</button>{editingId && <button type="button" className="module-button" onClick={resetForm}>Cancel</button>}</div>
        </form>
      </section>
    </div>
  </div>;
}
