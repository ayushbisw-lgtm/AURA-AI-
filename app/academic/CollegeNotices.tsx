'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadAcademicData, saveAcademicRecord } from '@/lib/academic-store';
import type { AcademicTask } from '@/lib/academic-types';

type Notice = { id: string; subject: string; sender_name: string; sender_address: string; received_at: string; web_link: string | null; summary: string | null; category: string; importance: string; extracted_dates: Array<{ value: string; uncertain: boolean }>; action_items: string[]; processing_status: string; confidence: number; attachment_metadata: Array<{ metadataStatus?: string }>; is_notice: boolean; archived: boolean; read_at: string | null; ignored: boolean };
type Status = { connected: boolean; email: string | null; displayName: string | null; lastSyncedAt: string | null; syncStatus: string; syncError: string | null };
const categories = [['all','All'],['exam','Exams'],['assignment','Assignments'],['fees','Fees'],['timetable','Timetable'],['event','Events'],['other','Other']] as const;

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not synced yet'; }

export default function CollegeNotices() {
  const [status, setStatus] = useState<Status | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');
  const [unread, setUnread] = useState(false);
  const [review, setReview] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [confirmedDates, setConfirmedDates] = useState<number[]>([]);

  const load = useCallback(async () => {
    setError('');
    try {
      const connectionResponse = await fetch('/api/outlook?resource=status', { cache: 'no-store' });
      const connection = await connectionResponse.json();
      if (!connectionResponse.ok) throw new Error(connection.error || 'Could not check Outlook connection.');
      setStatus(connection);
      if (!connection.connected) { setNotices([]); return; }
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (query.trim()) params.set('q', query.trim());
      if (after) params.set('after', new Date(`${after}T00:00:00`).toISOString());
      if (before) params.set('before', new Date(`${before}T23:59:59`).toISOString());
      if (unread) params.set('unread', 'true');
      if (review) params.set('review', 'true');
      if (showArchived) params.set('archived', 'true');
      const response = await fetch(`/api/outlook?${params}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load notices.');
      setNotices(result.notices || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Outlook notices.'); }
  }, [category, query, after, before, unread, review, showArchived]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('outlookError');
    if (params.get('outlook') === 'connected') setToast('College Outlook connected. Sync notices to load recent messages.');
    if (oauthError) setError(oauthError);
  }, []);

  const visible = useMemo(() => notices.filter(notice => notice.is_notice && !notice.ignored), [notices]);

  async function sync() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/outlook/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 150 }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Notice sync failed.');
      setToast(`Sync complete. ${result.saved} messages checked.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Notice sync failed.'); await load(); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Outlook and delete AURA’s saved credentials? Your saved notice archive will remain in AURA.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/outlook/disconnect', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not disconnect Outlook.');
      setToast(result.message); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not disconnect Outlook.'); }
    finally { setBusy(false); }
  }

  async function update(id: string, action: string, categoryValue?: string) {
    const response = await fetch('/api/outlook', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, category: categoryValue }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Could not update notice.'); return; }
    if (action !== 'read' && action !== 'unread') setSelected(null);
    await load();
  }

  async function addConfirmedDeadline(notice: Notice, dateIndex: number) {
    if (!confirmedDates.includes(dateIndex)) { setError('Confirm the candidate date before adding it to your Academic planner.'); return; }
    try {
      const data = await loadAcademicData();
      const subject = data.subjects[0];
      if (!subject) { setError('Add a subject under Courses & semesters before adding this deadline to your planner.'); return; }
      const date = notice.extracted_dates[dateIndex]?.value;
      if (!date) return;
      const dueDate = new Date(date).toISOString().slice(0, 10);
      const kind = notice.category === 'exam' ? 'exam' : 'revision';
      const title = `${notice.category === 'exam' ? 'Exam' : 'Deadline'}: ${notice.subject || 'College notice'}`.slice(0, 160);
      const existing = data.tasks.find(task => task.kind === kind && task.subjectId === subject.id && task.dueDate === dueDate && task.title === title);
      if (existing) { setToast('This confirmed deadline is already in your Academic planner.'); return; }
      const task: AcademicTask = { id: crypto.randomUUID(), title, kind, subjectId: subject.id, dueDate, completed: false, progress: 0, createdAt: new Date().toISOString() };
      await saveAcademicRecord('tasks', task);
      setToast('Confirmed deadline added to your Academic planner.');
    } catch { setError('Could not save this deadline to your Academic planner.'); }
  }

  return <section className="academic-page college-notices-page">
    <div className="page-intro notice-intro"><div><span className="dashboard-eyebrow">ACADEMIC INBOX</span><h2>College notices</h2><p>Review academic announcements from your college mailbox. AURA never changes messages in Outlook.</p></div></div>
    {error && <div className="academic-alert error" role="alert">{error}</div>}
    {toast && <div className="academic-alert success" role="status">{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss">×</button></div>}
    <article className="dashboard-card outlook-connection">
      <div className="outlook-status"><span className={`provider-dot ${status?.connected ? 'online' : 'offline'}`}/><div><strong>{status?.connected ? `Connected${status.email ? ` · ${status.email}` : ''}` : 'Outlook not connected'}</strong><small>{status?.connected ? `Last successful sync: ${formatDate(status.lastSyncedAt)}${status.syncStatus === 'syncing' ? ' · Syncing…' : ''}` : 'Connect your college Microsoft 365 account to import notices.'}</small>{status?.syncError && <small className="notice-error-detail">Last sync issue: {status.syncError}</small>}</div></div>
      <div className="outlook-controls">{status?.connected ? <><button className="topbar-courses" onClick={() => void sync()} disabled={busy}>{busy ? 'Syncing…' : 'Sync notices'}</button><button className="outline-button" onClick={() => void disconnect()} disabled={busy}>Disconnect</button></> : <a className="topbar-courses" href="/api/outlook/connect">Connect College Outlook</a>}</div>
    </article>
    {status?.connected && <>
      <div className="notice-filters dashboard-card">
        <label className="notice-search">Search<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Subject or sender"/></label>
        <label>From<input type="date" value={after} onChange={event => setAfter(event.target.value)}/></label><label>To<input type="date" value={before} onChange={event => setBefore(event.target.value)}/></label>
        <label className="notice-check"><input type="checkbox" checked={unread} onChange={event => setUnread(event.target.checked)}/>Unread</label>
        <label className="notice-check"><input type="checkbox" checked={review} onChange={event => setReview(event.target.checked)}/>Needs review</label>
        <label className="notice-check"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)}/>Archived</label>
      </div>
      <nav className="notice-category-tabs" aria-label="Filter notice category">{categories.map(([id,label]) => <button key={id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)}>{label}</button>)}</nav>
      {busy && <div className="academic-loading"><span className="academic-spinner"/> Syncing your college mailbox…</div>}
      {!busy && visible.length === 0 && <div className="dashboard-card notice-empty"><strong>{status.syncStatus === 'never' ? 'Ready to sync your mailbox' : 'No matching academic notices'}</strong><p>{status.syncStatus === 'never' ? 'Choose Sync notices to check the most recent 30 days.' : 'Try another filter or sync again later. Messages that do not look academic stay out of this inbox.'}</p></div>}
      <div className="notice-list">{visible.map(notice => <button className={`dashboard-card notice-card ${notice.read_at ? 'read' : 'unread'}`} key={notice.id} onClick={() => { setConfirmedDates([]); setSelected(notice); if (!notice.read_at) void update(notice.id, 'read'); }}>
        <span className="notice-card-top"><span className={`notice-category ${notice.category}`}>{notice.category}</span><span className={`notice-importance ${notice.importance}`}>{notice.importance}</span></span><strong>{notice.subject || '(No subject)'}</strong><span className="notice-sender">{notice.sender_name || notice.sender_address}{notice.sender_name && notice.sender_address ? ` · ${notice.sender_address}` : ''}</span><span className="notice-card-date">{formatDate(notice.received_at)}</span><p>{notice.summary || 'Summary unavailable. Review the original message before acting.'}</p>{notice.processing_status === 'review_needed' && <span className="notice-review-flag">Dates need confirmation</span>}
      </button>)}</div>
    </>}
    {selected && <div className="notice-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="notice-detail dashboard-card" role="dialog" aria-modal="true" aria-labelledby="notice-detail-title"><button className="notice-close" onClick={() => setSelected(null)} aria-label="Close notice">×</button><span className={`notice-category ${selected.category}`}>{selected.category}</span><h2 id="notice-detail-title">{selected.subject || '(No subject)'}</h2><p className="notice-sender">From {selected.sender_name} &lt;{selected.sender_address}&gt; · {formatDate(selected.received_at)}</p><p>{selected.summary || 'Summary unavailable. Open the original Outlook message to review its contents.'}</p>
      <label className="notice-correction">Category<select value={selected.category} onChange={event => void update(selected.id, 'correct', event.target.value)}>{categories.filter(([id]) => id !== 'all').map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label>
      {!!selected.extracted_dates.length && <div className="notice-review-dates"><strong>Dates and deadlines to review</strong><p>Candidate dates are uncertain. Confirm each one before it is added to your Academic planner.</p>{selected.extracted_dates.map((date,index) => <div key={index} className="uncertain-date-row"><label className="uncertain-date"><input type="checkbox" checked={confirmedDates.includes(index)} onChange={event => setConfirmedDates(items => event.target.checked ? [...items,index] : items.filter(item => item !== index))}/> {formatDate(date.value)} <span>Needs confirmation</span></label><button className="outline-button" onClick={() => void addConfirmedDeadline(selected,index)}>Confirm and add to planner</button></div>)}<small>The task is added to the first course in Courses &amp; semesters. Review it in Learning Path and edit its course if needed.</small></div>}
      {!!selected.attachment_metadata.length && <p className="notice-attachment">This message has attachments. Open Outlook to review them safely.</p>}
      <div className="notice-detail-actions">{selected.web_link && <a className="topbar-courses" href={selected.web_link} target="_blank" rel="noreferrer">Open original in Outlook ↗</a>}<button className="outline-button" onClick={() => void update(selected.id, selected.archived ? 'restore' : 'archive')}>{selected.archived ? 'Restore from AURA archive' : 'Archive in AURA'}</button><button className="text-link" onClick={() => void update(selected.id, 'ignore')}>Mark irrelevant</button></div>
    </section></div>}
  </section>;
}
