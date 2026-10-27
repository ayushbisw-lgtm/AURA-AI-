'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { retrieveStudyChunks, splitStudyText, validateStudyFile } from '@/lib/academic-core';
import { deleteAcademicRecord, EMPTY_ACADEMIC_DATA, loadAcademicData, saveAcademicRecord, setAcademicUser } from '@/lib/academic-store';
import type { AcademicData, AcademicTask, AcademicTaskKind, Semester, StudyChunk, StudyDocument, Subject } from '@/lib/academic-types';
import AcademicDashboard, { EmptySettings, Icon, navGroups, QuickProfile, type AcademicAction, type AcademicSection, type ExamFormat, type ProviderStatus } from './AcademicDashboard';
import AttendanceTracker from './AttendanceTracker';
import type { WorkspaceSection } from '../WorkspaceSidebar';
import './academic.css';

type AcademicMessage = { role: 'user' | 'assistant'; content: string; sources?: string[] };
type AcademicTheme = 'light' | 'dark' | 'system';
const THEME_STORAGE_KEY = 'aura-academic-theme';
const NEW_SEMESTER_OPTION = '__new_semester__';
const KIND_LABELS: Record<AcademicTaskKind, string> = { exam: 'Exam', goal: 'Daily goal', syllabus: 'Syllabus', revision: 'Revision' };
const COLORS = ['#8fa8ff', '#68d9a0', '#f6bd70', '#d49cff', '#ff8c9c', '#62cce3'];

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function extractFile(file: File): Promise<{ chunks: StudyChunk[]; pageCount?: number; type: StudyDocument['type'] }> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') {
    if ((await file.slice(0, 5).text()) !== '%PDF-') throw new Error('This file does not look like a valid PDF.');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWorkerFetch: false });
    const pdf = await loadingTask.promise;
    try {
      if (pdf.numPages > 500) throw new Error('PDFs are limited to 500 pages.');
      const chunks: StudyChunk[] = [];
      let extractedChars = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(item => 'str' in item ? item.str : '').join(' ').trim();
        extractedChars += text.length;
        if (extractedChars > 500_000) throw new Error('Extracted PDF text is over the 500,000 character limit.');
        chunks.push(...splitStudyText(text, pageNumber));
      }
      if (chunks.length === 0) throw new Error('No selectable text was found. Scanned image PDFs are not supported yet.');
      return { chunks, pageCount: pdf.numPages, type: 'pdf' };
    } finally {
      await loadingTask.destroy();
    }
  }

  const text = await file.text();
  if (text.includes('\0')) throw new Error('This file does not appear to contain readable text.');
  if (text.length > 500_000) throw new Error('Extracted text is over the 500,000 character limit.');
  const chunks = splitStudyText(text);
  if (chunks.length === 0) throw new Error('This file does not contain readable text.');
  return { chunks, type: extension === 'md' || extension === 'markdown' ? 'md' : 'txt' };
}

export default function AcademicWorkspace({ onBack, userId, onSignOut, onNavigateWorkspace, isVisible = true, preferredName, onEditPreferredName }: { onBack: () => void; userId: string; onSignOut: () => void; onNavigateWorkspace: (section: Exclude<WorkspaceSection, 'academic'>) => void; isVisible?: boolean; preferredName: string; onEditPreferredName: () => void }) {
  const [section, setSection] = useState<AcademicSection>('overview');
  const [data, setData] = useState<AcademicData>(EMPTY_ACADEMIC_DATA);
  const [loading, setLoading] = useState(true);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>('checking');
  const [modelName, setModelName] = useState('qwen2.5:3b');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [activePrompt, setActivePrompt] = useState('');
  const [examFormat, setExamFormat] = useState<ExamFormat>('mcq');
  const [plannerDate, setPlannerDate] = useState(todayString());
  const [navigationKey, setNavigationKey] = useState(0);
  const [theme, setTheme] = useState<AcademicTheme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [themeReady, setThemeReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoadError('');
    try {
      setData(await loadAcademicData());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load local academic data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setAcademicUser(userId); void refresh(); }, [userId]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') setTheme(stored);
    } catch {
      // The theme still works for this session when browser storage is unavailable.
    } finally {
      setThemeReady(true);
    }
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Keep the selected theme in memory if browser storage is unavailable.
    }
  }, [theme, themeReady]);
  useEffect(() => {
    if (theme !== 'system') {
      setResolvedTheme(theme);
      return;
    }
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => setResolvedTheme(preference.matches ? 'dark' : 'light');
    updateTheme();
    preference.addEventListener('change', updateTheme);
    return () => preference.removeEventListener('change', updateTheme);
  }, [theme]);
  useEffect(() => {
    const controller = new AbortController();
    async function checkProvider() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!controller.signal.aborted) {
          setProviderStatus(response.ok && result.ok ? 'online' : 'offline');
          if (typeof result.model === 'string') setModelName(result.model);
        }
      } catch {
        if (!controller.signal.aborted) setProviderStatus('offline');
      }
    }
    void checkProvider();
    return () => controller.abort();
  }, []);

  async function runAction(action: () => Promise<void>, success?: string) {
    setActionError('');
    setNotice('');
    try {
      await action();
      await refresh();
      if (success) setNotice(success);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save this change.');
    }
  }

  function navigate(action: AcademicAction) {
    setActionError('');
    setNotice('');
    if (action.section === 'chat') { onBack(); return; }
    setSection(action.section);
    setActivePrompt(action.prompt ?? '');
    if (action.format) setExamFormat(action.format);
    if (action.date) setPlannerDate(action.date);
    setNavigationKey(key => key + 1);
  }

  const sectionTitle: Record<AcademicSection, string> = {
    overview: 'Home', courses: 'Courses & semesters', materials: 'PDF reader', ask: 'Ask your materials',
    exams: 'Practice studio', planner: 'Learning path', attendance: 'Attendance Tracker', settings: 'Settings'
  };
  const upcoming = useMemo(() => data.tasks.filter(task => task.kind === 'exam' && !task.completed)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3), [data.tasks]);
  const syllabusTasks = data.tasks.filter(task => task.kind === 'syllabus');
  const syllabusProgress = syllabusTasks.length
    ? Math.round(syllabusTasks.reduce((sum, task) => sum + task.progress, 0) / syllabusTasks.length) : 0;

  return <main className="academic-shell" data-theme={resolvedTheme} hidden={!isVisible}>
    <aside className="academic-sidebar">
      <button className="academic-brand" onClick={() => navigate({ section: 'overview' })} aria-label="AURA AI Academic home">
        <span className="academic-brand-mark"><Icon name="spark" size={19}/></span><span><strong>AURA</strong><small>AI ACADEMIC</small></span>
      </button>
      <div className="sidebar-nav-label">WORKSPACE</div>
      {navGroups(navigate, section, activePrompt, examFormat)}
      <div className="sidebar-nav-label">PERSONAL WORKSPACE</div>
      <nav className="academic-tool-nav" aria-label="Personal workspace tools">
        <button className="dashboard-nav-item" onClick={() => onNavigateWorkspace('memory')}><Icon name="database" size={16}/><span>Memory</span></button>
        <button className="dashboard-nav-item" onClick={() => onNavigateWorkspace('coding')}><Icon name="mind" size={16}/><span>Coding tools</span></button>
        <button className="dashboard-nav-item" onClick={() => onNavigateWorkspace('tasks')}><Icon name="calendar" size={16}/><span>Tasks</span></button>
      </nav>
      <div className="academic-sidebar-bottom"><button className={`dashboard-nav-item ${section === 'courses' ? 'active' : ''}`} aria-current={section === 'courses' ? 'page' : undefined} onClick={() => navigate({ section: 'courses' })}><Icon name="book" size={17}/><span>Courses &amp; semesters</span></button><QuickProfile onSettings={() => navigate({ section: 'settings' })}/></div>
    </aside>
    <section className="academic-main">
      <header className="academic-topbar"><div><span className="academic-kicker">AURA AI ACADEMIC</span><h1>{sectionTitle[section]}</h1></div><div className="topbar-actions"><span className={`provider-chip ${providerStatus}`}><i/>{providerStatus === 'checking' ? 'Checking AI' : providerStatus === 'online' ? `${modelName} ready` : 'AI offline'}</span><button className="topbar-courses" onClick={() => navigate({ section: 'courses' })}><Icon name="plus" size={15}/> Add course</button><button className="academic-signout" onClick={onSignOut}>Sign out</button></div></header>
      <div className="academic-content">
        {loadError && <div className="academic-alert error" role="alert">{loadError} <button onClick={() => { setLoading(true); void refresh(); }}>Try again</button></div>}
        {actionError && <div className="academic-alert error" role="alert">{actionError}</div>}
        {notice && <div className="academic-alert success" role="status">{notice}</div>}
        {loading ? <div className="academic-loading"><span className="academic-spinner"/> Loading your workspace…</div> : <>
          {section === 'overview' && <AcademicDashboard data={data} providerStatus={providerStatus} modelName={modelName} selectedSubjectId={selectedSubjectId} onSubjectChange={setSelectedSubjectId} onNavigate={navigate} runAction={runAction} />}
          {section === 'courses' && <Overview data={data} upcoming={upcoming} progress={syllabusProgress} runAction={runAction} />}
          {section === 'materials' && <Materials data={data} runAction={runAction} />}
          {section === 'ask' && <AskDocuments key={navigationKey} data={data} selectedSubjectId={selectedSubjectId} onSubjectChange={setSelectedSubjectId} initialQuestion={activePrompt} />}
          {section === 'exams' && <ExamPrep key={navigationKey} data={data} initialFormat={examFormat} initialSubjectId={selectedSubjectId} />}
          {section === 'planner' && <Planner key={navigationKey} data={data} runAction={runAction} initialDate={plannerDate} initialSubjectId={selectedSubjectId} />}
          {section === 'attendance' && <AttendanceTracker userId={userId} onAddSubject={() => navigate({ section: 'courses' })} />}
          {section === 'settings' && <EmptySettings data={data} status={providerStatus} modelName={modelName} theme={theme} onThemeChange={setTheme} preferredName={preferredName} onEditPreferredName={onEditPreferredName} />}
        </>}
      </div>
    </section>
  </main>;
}

function Overview({ data, upcoming, progress, runAction }: {
  data: AcademicData; upcoming: AcademicTask[]; progress: number;
  runAction: (action: () => Promise<void>, success?: string) => Promise<void>;
}) {
  const [semesterName, setSemesterName] = useState('');
  const [semesterStart, setSemesterStart] = useState(todayString());
  const [semesterEnd, setSemesterEnd] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [newSemesterName, setNewSemesterName] = useState('');
  const [newSemesterStart, setNewSemesterStart] = useState(todayString());
  const [newSemesterEnd, setNewSemesterEnd] = useState('');
  const [subjectColor, setSubjectColor] = useState(COLORS[0]);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (semesterId === NEW_SEMESTER_OPTION) return;
    if (data.semesters.some(semester => semester.id === semesterId)) return;
    setSemesterId(data.semesters[0]?.id ?? '');
  }, [data.semesters, semesterId]);

  async function addSemester(event: FormEvent) {
    event.preventDefault(); setFormError('');
    if (!semesterName.trim() || !semesterEnd || semesterEnd < semesterStart) { setFormError('Enter a semester name and a valid date range.'); return; }
    const semester: Semester = { id: createId(), name: semesterName.trim().slice(0, 80), startDate: semesterStart, endDate: semesterEnd, createdAt: new Date().toISOString() };
    await runAction(() => saveAcademicRecord('semesters', semester), 'Semester added.');
    setSemesterName('');
  }

  async function addSubject(event: FormEvent) {
    event.preventDefault(); setFormError('');
    if (!subjectName.trim()) { setFormError('Enter a subject name.'); return; }
    let semester = data.semesters.find(item => item.id === semesterId);
    if (semesterId === NEW_SEMESTER_OPTION) {
      if (!newSemesterName.trim() || !newSemesterEnd || newSemesterEnd < newSemesterStart) {
        setFormError('Enter a semester name and a valid date range.'); return;
      }
      semester = {
        id: createId(), name: newSemesterName.trim().slice(0, 80),
        startDate: newSemesterStart, endDate: newSemesterEnd, createdAt: new Date().toISOString()
      };
    }
    if (!semester) { setFormError('Choose a saved semester or write a new one.'); return; }
    const subject: Subject = { id: createId(), name: subjectName.trim().slice(0, 80), code: subjectCode.trim().slice(0, 24), semesterId: semester.id, color: subjectColor, createdAt: new Date().toISOString() };
    await runAction(async () => {
      if (semesterId === NEW_SEMESTER_OPTION) await saveAcademicRecord('semesters', semester!);
      await saveAcademicRecord('subjects', subject);
    }, 'Subject added.');
    setSemesterId(semester.id);
    setSubjectName(''); setSubjectCode('');
    if (semesterId === NEW_SEMESTER_OPTION) {
      setNewSemesterName(''); setNewSemesterStart(todayString()); setNewSemesterEnd('');
    }
  }

  async function removeSubject(subject: Subject) {
    if (data.documents.some(doc => doc.subjectId === subject.id) || data.tasks.some(task => task.subjectId === subject.id)) {
      setFormError('Move or remove this subject’s materials and planner items before deleting it.'); return;
    }
    await runAction(() => deleteAcademicRecord('subjects', subject.id), 'Subject removed.');
  }

  return <div className="academic-page">
    <section className="academic-hero"><div><span className="academic-kicker">A LITTLE PROGRESS, EVERY DAY</span><h2>Your semester,<br/><i>in focus.</i></h2><p>Keep course material, exam preparation, and study plans together in one private workspace.</p></div><div className="academic-hero-art"><span>✳</span><small>LEARN · PRACTICE · REPEAT</small></div></section>
    <div className="academic-stats">
      <StatCard label="SEMESTERS" value={data.semesters.length} icon="▦" detail="Organized terms" />
      <StatCard label="SUBJECTS" value={data.subjects.length} icon="◈" detail="Across your courses" />
      <StatCard label="STUDY MATERIALS" value={data.documents.length} icon="▤" detail="Saved on this device" />
      <StatCard label="SYLLABUS PROGRESS" value={`${progress}%`} icon="↗" detail={data.tasks.filter(task => task.kind === 'syllabus').length ? `${data.tasks.filter(task => task.kind === 'syllabus').length} tracked topics` : 'Add topics in your planner'} />
    </div>
    <div className="academic-columns">
      <section className="academic-card"><div className="academic-card-heading"><div><span className="academic-kicker">YOUR COURSES</span><h3>Subjects</h3></div><span className="academic-count">{data.subjects.length}</span></div>
        {data.subjects.length === 0 ? <div className="academic-empty compact"><span>◈</span><strong>No subjects yet</strong><p>Add a semester, then create your first subject.</p></div> : <div className="subject-list">{data.subjects.map(subject => <div className="subject-row" key={subject.id}><span className="subject-swatch" style={{ background: subject.color }}/><div><strong>{subject.name}</strong><small>{subject.code || 'Course'} · {data.semesters.find(s => s.id === subject.semesterId)?.name || 'Semester'}</small></div><button className="icon-button" aria-label={`Delete ${subject.name}`} title="Delete subject" onClick={() => void removeSubject(subject)}>×</button></div>)}</div>}
        <form className="academic-form" onSubmit={event => void addSubject(event)}><h4>Add a subject</h4><label>Subject name<input value={subjectName} onChange={event => setSubjectName(event.target.value)} maxLength={80} placeholder="e.g. Data Structures" required/></label><div className="form-row"><label>Course code<input value={subjectCode} onChange={event => setSubjectCode(event.target.value)} maxLength={24} placeholder="CS201"/></label><label>Semester<select value={semesterId} onChange={event => setSemesterId(event.target.value)} required><option value="">Choose an option…</option>{data.semesters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value={NEW_SEMESTER_OPTION}>＋ Write a new semester</option></select></label></div>{semesterId === NEW_SEMESTER_OPTION && <><label>New semester name<input value={newSemesterName} onChange={event => setNewSemesterName(event.target.value)} maxLength={80} placeholder="e.g. Fall 2026" required/></label><div className="form-row"><label>Starts<input type="date" value={newSemesterStart} onChange={event => setNewSemesterStart(event.target.value)} required/></label><label>Ends<input type="date" value={newSemesterEnd} onChange={event => setNewSemesterEnd(event.target.value)} min={newSemesterStart} required/></label></div></>}<div className="color-picker" aria-label="Subject color">{COLORS.map(color => <button key={color} type="button" aria-label={`Choose ${color}`} className={subjectColor === color ? 'chosen' : ''} style={{ background: color }} onClick={() => setSubjectColor(color)}/>)}</div><button className="academic-primary" type="submit">＋ Add subject</button></form>
      </section>
      <div className="academic-stack">
        <section className="academic-card"><div className="academic-card-heading"><div><span className="academic-kicker">YOUR TERM</span><h3>Semesters</h3></div><span className="academic-count">{data.semesters.length}</span></div>
          {data.semesters.length === 0 ? <div className="semester-empty">Create a semester to start organizing subjects.</div> : <div className="semester-list">{data.semesters.map(semester => <div className="semester-row" key={semester.id}><div><strong>{semester.name}</strong><small>{semester.startDate} — {semester.endDate}</small></div><button className="icon-button" aria-label={`Delete ${semester.name}`} title="Delete semester" disabled={data.subjects.some(s => s.semesterId === semester.id)} onClick={() => void runAction(() => deleteAcademicRecord('semesters', semester.id), 'Semester removed.')}>×</button></div>)}</div>}
          <form className="academic-form compact-form" onSubmit={event => void addSemester(event)}><h4>Add a semester</h4><label>Name<input value={semesterName} onChange={event => setSemesterName(event.target.value)} maxLength={80} placeholder="e.g. Fall 2026" required/></label><div className="form-row"><label>Starts<input type="date" value={semesterStart} onChange={event => setSemesterStart(event.target.value)} required/></label><label>Ends<input type="date" value={semesterEnd} onChange={event => setSemesterEnd(event.target.value)} min={semesterStart} required/></label></div><button className="academic-secondary" type="submit">＋ Add semester</button></form>
          {formError && <p className="inline-error" role="alert">{formError}</p>}
        </section>
        <section className="academic-card upcoming-card"><div className="academic-card-heading"><div><span className="academic-kicker">KEEP AN EYE ON</span><h3>Upcoming exams</h3></div><span className="academic-card-icon">◷</span></div>{upcoming.length === 0 ? <p className="muted-copy">No exams planned. Add an exam date in your study planner.</p> : upcoming.map(task => <div className="upcoming-row" key={task.id}><span className="upcoming-date">{new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><div><strong>{task.title}</strong><small>{data.subjects.find(s => s.id === task.subjectId)?.name || 'Subject'}</small></div></div>)}</section>
      </div>
    </div>
    <div className="academic-privacy-note"><span>⌂</span><p><strong>Private by default.</strong> Your academic records and uploaded study materials are stored in this browser on this device. Clearing browser storage removes them.</p></div>
  </div>;
}

function StatCard({ label, value, icon, detail }: { label: string; value: string | number; icon: string; detail: string }) {
  return <div className="academic-stat"><span className="stat-icon">{icon}</span><span className="academic-kicker">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Materials({ data, runAction }: { data: AcademicData; runAction: (action: () => Promise<void>, success?: string) => Promise<void> }) {
  const [subjectId, setSubjectId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const visibleDocs = data.documents.filter(doc => (!subjectId || doc.subjectId === subjectId) && doc.name.toLowerCase().includes(search.toLowerCase()));

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    setError('');
    if (!subjectId) { setError('Choose a subject before adding materials.'); return; }
    if (files.length === 0) return;
    if (data.documents.length + files.length > 100) { setError('You can save up to 100 study files.'); return; }
    setUploading(true);
    try {
      for (const file of files) {
        const issue = validateStudyFile(file);
        if (issue) throw new Error(`${file.name}: ${issue}`);
        const extracted = await extractFile(file);
        const document: StudyDocument = { id: createId(), name: file.name.slice(0, 180), size: file.size, subjectId, addedAt: new Date().toISOString(), ...extracted };
        await saveAcademicRecord('documents', document);
      }
      await runAction(async () => {}, `${files.length} ${files.length === 1 ? 'file added' : 'files added'} to your study library.`);
    } catch (issue) {
      await runAction(async () => {});
      setError(issue instanceof Error ? issue.message : 'Could not read this file.');
    } finally {
      setUploading(false);
    }
  }

  return <section className="academic-page">
    <div className="page-intro"><div><span className="academic-kicker">YOUR PRIVATE LIBRARY</span><h2>Study materials</h2><p>Upload readable course notes, and AURA will find relevant passages when you ask a question.</p></div><div className="library-count">{data.documents.length}<small>files saved</small></div></div>
    <div className="upload-panel"><div className="upload-symbol">↑</div><div className="upload-copy"><strong>Add study files</strong><span>PDF, TXT, or Markdown · max 10 MB each · selectable text PDFs only</span></div><label className={`academic-primary upload-button ${uploading || data.subjects.length === 0 ? 'disabled' : ''}`}><input type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" multiple disabled={uploading || data.subjects.length === 0} onChange={event => void handleFiles(event)}/>{uploading ? 'Extracting text…' : 'Choose files'}</label></div>
    {data.subjects.length === 0 && <div className="academic-alert">Create a subject in Overview before adding study files.</div>}
    {error && <div className="academic-alert error" role="alert">{error}</div>}
    {uploading && <div className="upload-progress"><span className="academic-spinner"/> Reading files locally and splitting into searchable chunks. Scanned PDFs need OCR and are not supported.</div>}
    <div className="library-toolbar"><h3>Library <span>{visibleDocs.length}</span></h3><div className="library-filters"><input aria-label="Search files" placeholder="Find a file…" value={search} onChange={event => setSearch(event.target.value)}/><select aria-label="Filter by subject" value={subjectId} onChange={event => setSubjectId(event.target.value)}><option value="">All subjects</option>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div></div>
    {visibleDocs.length === 0 ? <div className="academic-empty"><span>▤</span><strong>{data.documents.length ? 'No matching files' : 'Your library is ready'}</strong><p>{data.documents.length ? 'Try a different search or subject.' : 'Add lecture notes or course readings to ask questions grounded in your own material.'}</p></div> : <div className="document-grid">{visibleDocs.map(doc => <article className="document-card" key={doc.id}><div className={`file-badge ${doc.type}`}>{doc.type.toUpperCase()}</div><div className="document-info"><strong title={doc.name}>{doc.name}</strong><small>{data.subjects.find(s => s.id === doc.subjectId)?.name || 'Subject'} · {formatBytes(doc.size)}</small><small>{doc.chunks.length} chunks{doc.pageCount ? ` · ${doc.pageCount} pages` : ''}</small></div><button className="icon-button" aria-label={`Delete ${doc.name}`} title="Delete file" onClick={() => void runAction(() => deleteAcademicRecord('documents', doc.id), 'Study file removed.')}>×</button></article>)}</div>}
    <p className="academic-footnote">Files are parsed and indexed in this browser. Only selected text passages are sent to the configured local Ollama model when you ask a question.</p>
  </section>;
}

function AskDocuments({ data, selectedSubjectId, onSubjectChange, initialQuestion }: { data: AcademicData; selectedSubjectId: string; onSubjectChange: (id: string) => void; initialQuestion: string }) {
  const [input, setInput] = useState(initialQuestion);
  const [messages, setMessages] = useState<AcademicMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const docs = data.documents.filter(doc => !selectedSubjectId || doc.subjectId === selectedSubjectId);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput(''); setError('');
    const userMessage: AcademicMessage = { role: 'user', content: question };
    setMessages(current => [...current, userMessage]);
    const matches = retrieveStudyChunks(question, docs, selectedSubjectId || undefined, 5);
    if (!matches.length) {
      setMessages(current => [...current, { role: 'assistant', content: docs.length
        ? 'I couldn’t find a relevant passage in the selected study materials, so I can’t answer this from your documents. Try different keywords or add more material.'
        : 'There are no study materials for this selection yet. Add readable course notes in Study materials first.' }]);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/academic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'answer', question, chunks: matches.map(({ documentName, page, text }) => ({ document: documentName, page, text })) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not answer from the study materials.');
      const sources = [...new Set(matches.map(match => `${match.documentName}${match.page ? ` · page ${match.page}` : ''}`))];
      setMessages(current => [...current, { role: 'assistant', content: result.message, sources }]);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not reach the local model.');
      setMessages(current => [...current, { role: 'assistant', content: 'I couldn’t complete that question. Your study materials are still saved locally.' }]);
    } finally { setBusy(false); }
  }

  return <section className="academic-page qa-page"><div className="page-intro"><div><span className="academic-kicker">RETRIEVAL-AUGMENTED STUDY</span><h2>Ask your materials</h2><p>Answers are grounded in relevant passages from your uploaded files. If the library can’t support an answer, AURA will say so.</p></div><label className="subject-filter">Subject<select value={selectedSubjectId} onChange={event => onSubjectChange(event.target.value)}><option value="">All subjects</option>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label></div>
    <div className="retrieval-note"><span>⌕</span><p><strong>How this works</strong> AURA searches your saved text locally and sends up to five relevant passages to qwen2.5:3b. This version uses keyword matching; it does not use image understanding or cloud AI.</p></div>
    <div className="qa-transcript">{messages.length === 0 ? <div className="academic-empty"><span>⌕</span><strong>Ask a question from your notes</strong><p>Try “What are the main stages of the process?” or “How does this formula work?”</p></div> : messages.map((message, index) => <article key={index} className={`qa-message ${message.role}`}><div className="qa-avatar">{message.role === 'user' ? 'Y' : 'A'}</div><div><strong>{message.role === 'user' ? 'You' : 'AURA Academic'}</strong><p>{message.content}</p>{message.sources && <div className="source-list"><span>SOURCES</span>{message.sources.map(source => <small key={source}>▤ {source}</small>)}</div>}</div></article>)}{busy && <div className="academic-loading"><span className="academic-spinner"/> Reviewing retrieved passages…</div>}{error && <div className="academic-alert error" role="alert">{error}</div>}</div>
    <form className="academic-query" onSubmit={event => void ask(event)}><textarea value={input} onChange={event => setInput(event.target.value)} placeholder="Ask a question about your study materials…" maxLength={2000} rows={2} disabled={busy || docs.length === 0}/><div><span>{docs.length ? `${docs.length} file${docs.length === 1 ? '' : 's'} in scope` : 'Add study materials to begin'}</span><button className="academic-primary" disabled={busy || !input.trim() || docs.length === 0}>Ask AURA <span>↑</span></button></div></form>
  </section>;
}

function ExamPrep({ data, initialFormat, initialSubjectId }: { data: AcademicData; initialFormat: ExamFormat; initialSubjectId: string }) {
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [format, setFormat] = useState<ExamFormat>(initialFormat);
  const [count, setCount] = useState(5);
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate(event: FormEvent) {
    event.preventDefault();
    const subject = data.subjects.find(item => item.id === subjectId);
    if (!subject || !topic.trim()) { setError('Choose a subject and enter a topic.'); return; }
    setBusy(true); setError(''); setOutput('');
    const context = retrieveStudyChunks(`${subject.name} ${topic}`, data.documents, subjectId, 4);
    try {
      const response = await fetch('/api/academic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate', subject: subject.name, topic: topic.trim(), difficulty, format, count,
          chunks: context.map(({ documentName, page, text }) => ({ document: documentName, page, text })) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not prepare these questions.');
      setOutput(`${context.length ? `Based on ${[...new Set(context.map(c => c.documentName))].join(', ')}\n\n` : 'Based on general model knowledge. Check against your course syllabus.\n\n'}${result.message}`);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not reach the local model.');
    } finally { setBusy(false); }
  }

  return <section className="academic-page"><div className="page-intro"><div><span className="academic-kicker">PRACTICE WITH PURPOSE</span><h2>Exam preparation</h2><p>Create practice sets, revision cards, and mock papers for the topics you’re studying.</p></div><span className="exam-hero-icon">✳</span></div>
    {data.subjects.length === 0 ? <div className="academic-empty"><span>◈</span><strong>Add a subject to start</strong><p>Create a subject in Overview to build a focused study set.</p></div> : <div className="exam-layout"><form className="academic-card exam-form" onSubmit={event => void generate(event)}><span className="academic-kicker">BUILD A STUDY SET</span><h3>Set your practice</h3><label>Subject<select value={subjectId} onChange={event => setSubjectId(event.target.value)} required><option value="">Choose a subject…</option>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Topic<input value={topic} onChange={event => setTopic(event.target.value)} maxLength={240} placeholder="e.g. Binary search trees" required/></label><div className="form-row"><label>Format<select value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="mcq">Multiple choice</option><option value="short-answer">Short answer</option><option value="flashcards">Flashcards</option><option value="mock-paper">Mock paper</option></select></label><label>Difficulty<select value={difficulty} onChange={event => setDifficulty(event.target.value as typeof difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></div><label>Question count <span className="range-value">{count}</span><input className="count-range" type="range" min="1" max="20" value={count} onChange={event => setCount(Number(event.target.value))}/></label><p className="form-hint">When matching notes exist, AURA uses them as the basis for your questions.</p><button className="academic-primary full-button" disabled={busy || !subjectId || !topic.trim()}>{busy ? 'Preparing…' : '✳ Generate study set'}</button></form>
      <div className="academic-card output-card"><div className="academic-card-heading"><div><span className="academic-kicker">YOUR PRACTICE SET</span><h3>{output ? 'Ready to review' : 'Your questions will appear here'}</h3></div></div>{error && <div className="academic-alert error" role="alert">{error}</div>}{busy ? <div className="academic-loading"><span className="academic-spinner"/> Building your study set…</div> : output ? <pre className="generated-output">{output}</pre> : <div className="academic-empty compact"><span>✳</span><strong>Choose your practice settings</strong><p>Generated content is a study aid. Review answers against your course materials.</p></div>}</div></div>}
    <div className="model-capability-note"><span>✦</span><p>Text-only practice is supported by qwen2.5:3b. Uploading scanned pages or asking it to analyze diagrams is not supported.</p></div>
  </section>;
}

function Planner({ data, runAction, initialDate, initialSubjectId }: { data: AcademicData; runAction: (action: () => Promise<void>, success?: string) => Promise<void>; initialDate: string; initialSubjectId: string }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AcademicTaskKind>('goal');
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [dueDate, setDueDate] = useState(initialDate);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const tasks = [...data.tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const completion = data.tasks.length ? Math.round(data.tasks.filter(task => task.completed).length / data.tasks.length * 100) : 0;

  async function addTask(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!title.trim() || !subjectId || !data.subjects.some(subject => subject.id === subjectId) || !dueDate) { setError('Add a task title, subject, and date.'); return; }
    const task: AcademicTask = { id: createId(), title: title.trim().slice(0, 160), kind, subjectId, dueDate, completed: false, progress: kind === 'syllabus' ? progress : 0, createdAt: new Date().toISOString() };
    await runAction(() => saveAcademicRecord('tasks', task), 'Planner item added.');
    setTitle('');
  }

  async function toggleTask(task: AcademicTask) {
    await runAction(() => saveAcademicRecord('tasks', { ...task, completed: !task.completed }), task.completed ? 'Task marked as active.' : 'Task completed.');
  }

  return <section className="academic-page"><div className="page-intro"><div><span className="academic-kicker">MAKE TIME FOR WHAT MATTERS</span><h2>Study planner</h2><p>Track exam dates, syllabus coverage, daily goals, and revision tasks by subject.</p></div><div className="completion-ring" style={{ background: `conic-gradient(#82a0ff ${completion * 3.6}deg, #242b3a 0deg)` }}><span><strong>{completion}%</strong><small>done</small></span></div></div>
    {data.subjects.length === 0 ? <div className="academic-empty"><span>◷</span><strong>Your plan starts with a subject</strong><p>Add a subject in Overview to organize your study goals.</p></div> : <div className="planner-layout"><form className="academic-card planner-form" onSubmit={event => void addTask(event)}><span className="academic-kicker">ADD TO YOUR PLAN</span><h3>New planner item</h3><label>Task or topic<input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder="e.g. Revise linked lists" required/></label><div className="form-row"><label>Type<select value={kind} onChange={event => setKind(event.target.value as AcademicTaskKind)}><option value="goal">Daily goal</option><option value="exam">Exam date</option><option value="syllabus">Syllabus topic</option><option value="revision">Revision</option></select></label><label>Subject<select value={subjectId} onChange={event => setSubjectId(event.target.value)} required><option value="">Choose…</option>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label></div><label>{kind === 'exam' ? 'Exam date' : 'Target date'}<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} required/></label>{kind === 'syllabus' && <label>Syllabus progress <span className="range-value">{progress}%</span><input className="count-range" type="range" min="0" max="100" step="5" value={progress} onChange={event => setProgress(Number(event.target.value))}/></label>}{error && <p className="inline-error" role="alert">{error}</p>}<button className="academic-primary full-button">＋ Add to planner</button></form>
      <div className="academic-card task-list-card"><div className="academic-card-heading"><div><span className="academic-kicker">YOUR COMING UP</span><h3>Study plan <span className="academic-count">{tasks.length}</span></h3></div></div>{tasks.length === 0 ? <div className="academic-empty compact"><span>◷</span><strong>No planner items yet</strong><p>Add an exam date or a small goal to get started.</p></div> : <div className="task-list">{tasks.map(task => <article className={`task-row ${task.completed ? 'is-complete' : ''}`} key={task.id}><button className="task-check" aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={() => void toggleTask(task)}>{task.completed ? '✓' : ''}</button><div className="task-details"><div><span className={`task-kind ${task.kind}`}>{KIND_LABELS[task.kind]}</span><time>{new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></div><strong>{task.title}</strong><small>{data.subjects.find(subject => subject.id === task.subjectId)?.name || 'Subject'}</small>{task.kind === 'syllabus' && <div className="syllabus-bar"><span style={{ width: `${task.progress}%` }}/><small>{task.progress}%</small></div>}</div><button className="icon-button task-delete" aria-label={`Delete ${task.title}`} onClick={() => void runAction(() => deleteAcademicRecord('tasks', task.id), 'Planner item removed.')}>×</button></article>)}</div>}</div></div>}
    <div className="planner-note"><span>✳</span><p>Daily goals, revisions, and syllabus progress are kept separate from your general AURA chat history.</p></div>
  </section>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
