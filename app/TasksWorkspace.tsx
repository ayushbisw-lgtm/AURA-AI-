'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { filterAndSortTasks, localDateString, validateTask, type TaskFilter, type TaskSort } from '@/lib/personal-core';
import { deletePersonalTask, loadPersonalData, savePersonalTask } from '@/lib/personal-store';
import type { PersonalTask, PersonalTaskPriority } from '@/lib/personal-types';

const filters: { id: TaskFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' }, { id: 'overdue', label: 'Overdue' }
];

export default function TasksWorkspace({ userId }: { userId: string }) {
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [sort, setSort] = useState<TaskSort>('due');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<PersonalTaskPriority>('medium');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const today = localDateString();

  useEffect(() => {
    let current = true;
    void loadPersonalData(userId).then(data => { if (current) setTasks(data.tasks); })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Could not load tasks.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [userId]);

  const visibleTasks = useMemo(() => filterAndSortTasks(tasks, filter, query, sort, today), [tasks, filter, query, sort, today]);
  const pendingCount = tasks.filter(task => task.status === 'pending').length;
  const completedCount = tasks.filter(task => task.status === 'completed').length;

  function resetForm() {
    setTitle(''); setDescription(''); setDueDate(''); setPriority('medium'); setCategory(''); setEditingId(null); setFormOpen(false);
  }

  function beginCreate() { resetForm(); setFormOpen(true); setError(''); setNotice(''); }

  function beginEdit(task: PersonalTask) {
    setEditingId(task.id); setTitle(task.title); setDescription(task.description); setDueDate(task.dueDate ?? '');
    setPriority(task.priority); setCategory(task.category); setFormOpen(true); setError(''); setNotice('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const validationError = validateTask(title, description, dueDate, priority, category);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    const previous = tasks.find(task => task.id === editingId);
    const now = new Date().toISOString();
    const task: PersonalTask = {
      id: editingId ?? crypto.randomUUID(), title: title.trim(), description: description.trim(),
      ...(dueDate ? { dueDate } : {}), priority, status: previous?.status ?? 'pending', category: category.trim(),
      createdAt: previous?.createdAt ?? now, updatedAt: now
    };
    try {
      await savePersonalTask(userId, task);
      setTasks(current => [task, ...current.filter(item => item.id !== task.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      resetForm(); setNotice(editingId ? 'Task updated.' : 'Task added.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this task.'); }
    finally { setSaving(false); }
  }

  async function toggleTask(task: PersonalTask) {
    setError(''); setNotice('');
    const updated = { ...task, status: task.status === 'completed' ? 'pending' as const : 'completed' as const, updatedAt: new Date().toISOString() };
    try {
      await savePersonalTask(userId, updated);
      setTasks(current => current.map(item => item.id === task.id ? updated : item));
      setNotice(updated.status === 'completed' ? 'Task completed.' : 'Task reopened.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this task.'); }
  }

  async function removeTask(task: PersonalTask) {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    setError(''); setNotice('');
    try {
      await deletePersonalTask(userId, task.id); setTasks(current => current.filter(item => item.id !== task.id));
      if (editingId === task.id) resetForm(); setNotice('Task deleted.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this task.'); }
  }

  function isOverdue(task: PersonalTask) { return task.status === 'pending' && Boolean(task.dueDate && task.dueDate < today); }

  return <div className="module-page tasks-page">
    <div className="module-heading"><div><span className="eyebrow">YOUR PERSONAL PLAN</span><h2>Tasks</h2><p>Keep everyday tasks in one place. Your Academic course planner remains available in Academic.</p></div><button className="module-button primary" onClick={beginCreate}>＋ Add task</button></div>
    {error && <div className="module-alert error" role="alert">{error}</div>}{notice && <div className="module-alert success" role="status">{notice}</div>}
    <div className="task-summary">
      <article className="module-card task-summary-card"><span className="task-summary-icon pending">◷</span><div><small>PENDING</small><strong>{loading ? '—' : pendingCount}</strong></div></article>
      <article className="module-card task-summary-card"><span className="task-summary-icon completed">✓</span><div><small>COMPLETED</small><strong>{loading ? '—' : completedCount}</strong></div></article>
      <article className="module-card task-summary-card"><span className="task-summary-icon today-icon">⌁</span><div><small>DUE TODAY</small><strong>{loading ? '—' : tasks.filter(task => task.status === 'pending' && task.dueDate === today).length}</strong></div></article>
    </div>
    {formOpen && <section className="module-card task-form-card"><div className="module-section-head"><div><h3>{editingId ? 'Edit task' : 'New task'}</h3><p>Due date is optional. Dates use your local calendar.</p></div><button className="module-icon-button" aria-label="Close task form" onClick={resetForm}>×</button></div>
      <form className="module-form task-form" onSubmit={event => void submit(event)}>
        <label className="task-title-field">Title<input autoFocus required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs to get done?"/></label>
        <label>Description<textarea rows={2} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Optional details"/></label>
        <div className="task-form-grid"><label>Due date<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)}/></label><label>Priority<select value={priority} onChange={event => setPriority(event.target.value as PersonalTaskPriority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Category<input maxLength={80} value={category} onChange={event => setCategory(event.target.value)} placeholder="Optional"/></label></div>
        <div className="module-form-actions"><button className="module-button primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create task'}</button><button type="button" className="module-button" onClick={resetForm}>Cancel</button></div>
      </form>
    </section>}
    <section className="module-card tasks-list-card"><div className="task-toolbar"><div className="task-filters" aria-label="Filter tasks">{filters.map(item => <button className={filter === item.id ? 'active' : ''} aria-pressed={filter === item.id} key={item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div><div className="module-filters"><label className="module-search"><span aria-hidden="true">⌕</span><input aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Sort tasks" value={sort} onChange={event => setSort(event.target.value as TaskSort)}><option value="due">Due date</option><option value="priority">Priority</option><option value="recent">Recently updated</option></select></div></div>
      {loading ? <div className="module-empty">Loading your tasks…</div> : visibleTasks.length ? <div className="personal-task-list">{visibleTasks.map(task => <article className={`personal-task ${task.status === 'completed' ? 'is-complete' : ''}`} key={task.id}>
        <button className={`personal-task-check ${task.status === 'completed' ? 'checked' : ''}`} aria-label={task.status === 'completed' ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={() => void toggleTask(task)}>{task.status === 'completed' ? '✓' : ''}</button>
        <div className="personal-task-info"><div className="personal-task-title-row"><h3>{task.title}</h3><span className={`priority-chip ${task.priority}`}>{task.priority}</span></div>{task.description && <p>{task.description}</p>}<div className="personal-task-meta"><span>{task.dueDate ? <time dateTime={task.dueDate}>{new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time> : 'No due date'}</span>{task.category && <span className="task-category-chip">{task.category}</span>}{isOverdue(task) && <span className="overdue-chip">Overdue</span>}</div></div>
        <div className="personal-task-actions"><button onClick={() => beginEdit(task)} aria-label={`Edit ${task.title}`}>Edit</button><button className="delete-text" onClick={() => void removeTask(task)} aria-label={`Delete ${task.title}`}>Delete</button></div>
      </article>)}</div> : <div className="module-empty"><span className="module-empty-icon">✓</span><strong>{tasks.length ? 'No tasks in this view' : 'Your task list is clear'}</strong><p>{tasks.length ? 'Change the filter or search to find another task.' : 'Add your first task to track what you need to do.'}</p>{!tasks.length && <button className="module-button" onClick={beginCreate}>＋ Add a task</button>}</div>}
    </section>
  </div>;
}
