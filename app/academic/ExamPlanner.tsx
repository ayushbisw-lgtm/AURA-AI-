'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './AcademicDashboard';
import { createStudyPlan, localExamTimeToUtc, parseCsv, parseUnambiguousDate, validateTimetableFile, type ExamSubject, type PlannedExam, type ExamTopic } from '@/lib/exam-planner';
import { parseXlsxRows } from '@/lib/xlsx-core';
import './exam-planner.css';

type Candidate = { subject: string; code: string; title: string; date: string; dateEvidence?: string; startTime: string; endTime: string; venue: string; topics: string[]; uncertainFields: string[] };
type Store = { subjects: ExamSubject[]; exams: PlannedExam[]; topics: ExamTopic[]; sessions: Record<string, unknown>[]; preferences: Record<string, unknown>[]; imports: Record<string, unknown>[]; history: Record<string, unknown>[] };
type DeliveryStatus = { supabaseConfigured: boolean; emailProviderConfigured: boolean; verifiedEmail: boolean; email: string };
const EMPTY: Store = { subjects: [], exams: [], topics: [], sessions: [], preferences: [], imports: [], history: [] };
const VIEWS = ['Dashboard', 'Upload timetable', 'Upcoming exams', 'Past exams', 'Subject details', 'Study plan', 'Calendar', 'Reminders', 'Notification history'] as const;
type View = typeof VIEWS[number];
const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const isoDate = (value: string) => parseUnambiguousDate(value).date;

export default function ExamPlanner({ initialExamId = '', initialView = 'Dashboard' }: { initialExamId?: string; initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [store, setStore] = useState<Store>(EMPTY);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>({ supabaseConfigured: false, emailProviderConfigured: false, verifiedEmail: false, email: '' });
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<Candidate | null>(null);
  const [draftCandidates, setDraftCandidates] = useState<Candidate[]>([]);
  const [draftIndex, setDraftIndex] = useState(0);
  const [draftImport, setDraftImport] = useState<Record<string, unknown> | null>(null);
  const [fileMessage, setFileMessage] = useState('');
  const [selectedExam, setSelectedExam] = useState(initialExamId);
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectSemester, setSubjectSemester] = useState('');
  const [subjectFaculty, setSubjectFaculty] = useState('');
  const [subjectNotes, setSubjectNotes] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState('');
  const [examSubject, setExamSubject] = useState('');
  const [examTitle, setExamTitle] = useState('End semester examination');
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('09:00');
  const [examEndTime, setExamEndTime] = useState('');
  const [examVenue, setExamVenue] = useState('');
  const [examInstructions, setExamInstructions] = useState('');
  const [editingExam, setEditingExam] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState('');
  const [editingTopicTitle, setEditingTopicTitle] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(90);
  const [sessionMinutes, setSessionMinutes] = useState(30);
  const [allReminderSubjects, setAllReminderSubjects] = useState(true);
  const [reminderSubjectIds, setReminderSubjectIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/exam-planner', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load Exam Planner.');
      setStore({ ...EMPTY, ...result });
      setDeliveryStatus(result.status ?? { supabaseConfigured: false, emailProviderConfigured: false, verifiedEmail: false, email: '' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load Exam Planner.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const saved = store.preferences[0];
    if (saved) { setAllReminderSubjects(saved.all_subjects !== false); setReminderSubjectIds(Array.isArray(saved.selected_subject_ids) ? saved.selected_subject_ids as string[] : []); }
  }, [store.preferences]);

  async function callApi(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) {
    const response = await fetch('/api/exam-planner', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save this change.');
    return result;
  }
  async function run(action: () => Promise<unknown>, success?: string) {
    setSaving(true); setError(''); setNotice('');
    try { await action(); await reload(); if (success) setNotice(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not complete that action.'); }
    finally { setSaving(false); }
  }
  function updateDraft(candidate: Candidate) {
    setDraft(candidate);
    setDraftCandidates(current => current.map((item, index) => index === draftIndex ? candidate : item));
  }

  const upcoming = useMemo(() => store.exams.filter(exam => exam.status === 'scheduled' && Date.parse(exam.examAt) >= Date.now()).sort((a, b) => Date.parse(a.examAt) - Date.parse(b.examAt)), [store.exams]);
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: localTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const recentScheduleChanges = [...store.exams].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 3);
  const preparationSubjects = store.subjects.map(subject => ({ subject, remaining: store.exams.filter(exam => exam.subjectId === subject.id && exam.status === 'scheduled').reduce((total, exam) => total + store.topics.filter(topic => topic.exam_id === exam.id && !topic.completed).length, 0) })).filter(item => item.remaining > 0);
  const activeExam = store.exams.find(exam => exam.id === selectedExam) ?? upcoming[0] ?? store.exams.find(exam => exam.status === 'scheduled');
  const examTopics = activeExam ? store.topics.filter(topic => topic.exam_id === activeExam.id).sort((a, b) => a.position - b.position) : [];
  const pendingTopics = examTopics.filter(topic => !topic.completed).length;
  const preferences = store.preferences[0] ?? {};
  const reminderConfigured = deliveryStatus.emailProviderConfigured;

  async function createSubject(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const subjectPayload = { resource: 'subjects', name: subjectName, code: subjectCode, semester: subjectSemester, faculty_name: subjectFaculty, notes: subjectNotes };
      const created = editingSubjectId ? await callApi('PATCH', { ...subjectPayload, id: editingSubjectId }) : await callApi('POST', subjectPayload);
      setExamSubject(created.id); setSubjectName(''); setSubjectCode(''); setSubjectSemester(''); setSubjectFaculty(''); setSubjectNotes(''); setEditingSubjectId('');
    }, editingSubjectId ? 'Subject updated.' : 'Subject saved.');
  }

  function editSubject(subject: ExamSubject) {
    setEditingSubjectId(subject.id); setSubjectName(subject.name); setSubjectCode(subject.code); setSubjectSemester(subject.semester); setSubjectFaculty(subject.facultyName ?? ''); setSubjectNotes(subject.notes ?? ''); setView('Upload timetable');
  }

  async function deleteSubject(subject: ExamSubject) {
    if (store.exams.some(exam => exam.subjectId === subject.id)) { setError('Delete or reassign this subject’s exams before removing the subject.'); return; }
    await run(() => callApi('DELETE', { resource: 'subjects', id: subject.id }), 'Subject removed.');
  }

  async function createExam(event: FormEvent) {
    event.preventDefault();
    if (!examSubject || !examDate) { setError('Choose a subject and an exam date.'); return; }
    const converted = localExamTimeToUtc(examDate, examTime, localTimeZone());
    if (!converted.iso || converted.needsReview) { setError('This local date or time is invalid or ambiguous. Check the date, time, and timezone.'); return; }
    const end = examEndTime ? localExamTimeToUtc(examDate, examEndTime, localTimeZone()).iso : null;
    if (examEndTime && (!end || Date.parse(end) <= Date.parse(converted.iso))) { setError('End time must be later than the start time.'); return; }
    await run(async () => {
      const created = await callApi('POST', { resource: 'exams', subject_id: examSubject, title: examTitle, exam_at: converted.iso, timezone: localTimeZone(), end_at: end, venue: examVenue, instructions: examInstructions });
      setSelectedExam(created.id); setView('Subject details');
    }, 'Exam saved.');
  }

  function beginEditExam(exam: PlannedExam) {
    setExamSubject(exam.subjectId); setExamTitle(exam.title);
    const local = formatLocalInputs(exam.examAt, exam.timezone);
    const end = exam.endAt ? formatLocalInputs(exam.endAt, exam.timezone).time : '';
    setExamDate(local.date); setExamTime(local.time); setExamEndTime(end); setExamVenue(exam.venue ?? ''); setExamInstructions(exam.instructions ?? ''); setEditingExam(true);
  }

  async function saveExamEdit(event: FormEvent) {
    event.preventDefault();
    if (!activeExam) return;
    const converted = localExamTimeToUtc(examDate, examTime, localTimeZone());
    const end = examEndTime ? localExamTimeToUtc(examDate, examEndTime, localTimeZone()).iso : null;
    if (!converted.iso || examEndTime && (!end || Date.parse(end) <= Date.parse(converted.iso))) { setError('Check the exam date and time.'); return; }
    await run(async () => { await callApi('PATCH', { resource: 'exams', id: activeExam.id, subject_id: examSubject, title: examTitle, exam_at: converted.iso, timezone: localTimeZone(), end_at: end, venue: examVenue, instructions: examInstructions, status: activeExam.status, source_import_id: activeExam.sourceImportId }); setEditingExam(false); }, 'Exam details updated; pending reminders were recalculated.');
  }

  async function toggleTopic(topic: ExamTopic) {
    await run(() => callApi('PATCH', { resource: 'topics', id: topic.id, exam_id: topic.exam_id, title: topic.title, completed: !topic.completed, source: topic.source, position: topic.position }), 'Topic updated.');
  }

  async function saveTopicEdit(topic: ExamTopic) {
    if (!editingTopicTitle.trim()) return;
    await run(() => callApi('PATCH', { resource: 'topics', id: topic.id, exam_id: topic.exam_id, title: editingTopicTitle.trim(), completed: topic.completed, source: topic.source, position: topic.position }), 'Topic updated.');
    setEditingTopicId('');
  }

  async function addTopic(event: FormEvent) {
    event.preventDefault();
    if (!activeExam || !newTopic.trim()) return;
    await run(async () => { await callApi('POST', { resource: 'topics', exam_id: activeExam.id, title: newTopic.trim(), position: examTopics.length }); setNewTopic(''); }, 'Topic added.');
  }

  async function uploadTimetable(file: File) {
    setError(''); setNotice(''); setFileMessage(''); setDraft(null); setDraftCandidates([]); setDraftImport(null);
    const issue = validateTimetableFile(file);
    if (issue) { setError(issue); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = file.name.toLowerCase().split('.').pop();
    const signatureOk = extension === 'pdf' ? new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-' : extension === 'png' ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' : ['jpg', 'jpeg'].includes(extension || '') ? bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217 : true;
    if (!signatureOk) { setError('The file contents do not match the selected timetable type.'); return; }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const file_sha256 = [...new Uint8Array(digest)].map(part => part.toString(16).padStart(2, '0')).join('');
    let candidates: Candidate[] = [];
    if (extension === 'csv') {
      try { candidates = csvCandidates(parseCsv(new TextDecoder().decode(bytes))); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read this CSV.'); return; }
    } else if (extension === 'xlsx') {
      try {
        candidates = csvCandidates(parseXlsxRows(bytes));
        setFileMessage('Read the first worksheet. Review every row before saving.');
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read this workbook.'); return; }
    } else if (extension === 'pdf') {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
        const task = pdfjs.getDocument({ data: bytes, useWorkerFetch: false });
        const pdf = await task.promise;
        const pages: string[] = [];
        for (let page = 1; page <= Math.min(pdf.numPages, 80); page++) {
          const content = await (await pdf.getPage(page)).getTextContent();
          pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
        }
        await task.destroy();
        const text = pages.join('\n').trim();
        if (!text) setFileMessage('This PDF has no selectable text. OCR is not configured; add exam details manually below.');
        else {
          setFileMessage('AURA will suggest fields from the PDF text. Review every field before saving.');
          const response = await fetch('/api/academic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'interpret-timetable', timetableText: text.slice(0, 24000) }) });
          const parsed = await response.json();
          if (response.ok && Array.isArray(parsed.exams)) candidates = parsed.exams.map((candidate: Candidate) => ({ ...candidate, uncertainFields: candidate.uncertainFields?.length ? candidate.uncertainFields : [] }));
          else setFileMessage(`${parsed.error || 'AI interpretation unavailable.'} Review the PDF and enter fields manually.`);
        }
      } catch { setFileMessage('This PDF could not be read in the browser. Enter the exam details manually.'); }
    } else {
      setFileMessage('OCR is not configured for images. The file is recorded for this review; enter all exam details manually.');
    }
    if (!candidates.length) candidates = [blankCandidate()];
    try {
      const record = await callApi('POST', { resource: 'imports', source_name: file.name, file_sha256, parsed_data: candidates });
      setDraftImport(record); setDraftCandidates(candidates); setDraftIndex(0); setDraft(candidates[0]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the import review.'); }
  }

  async function confirmImport() {
    if (!draft || !draftImport) return;
    const candidates = draftCandidates.map((item, index) => index === draftIndex ? draft : item);
    const unresolved = candidates.findIndex(candidate => !candidate.subject.trim() || !isoDate(candidate.date) || !candidate.startTime || !localExamTimeToUtc(isoDate(candidate.date) ?? '', candidate.startTime, localTimeZone()).iso);
    if (unresolved >= 0) { setDraftIndex(unresolved); setDraft(candidates[unresolved]); setError(`Complete the subject, unambiguous date, and valid time for exam ${unresolved + 1}.`); return; }
    await run(async () => {
      for (const candidate of candidates) {
        const date = isoDate(candidate.date)!;
        const local = localExamTimeToUtc(date, candidate.startTime, localTimeZone());
        let subject = store.subjects.find(item => item.name.trim().toLowerCase() === candidate.subject.trim().toLowerCase());
        if (!subject) subject = await callApi('POST', { resource: 'subjects', name: candidate.subject, code: candidate.code });
        if (!subject?.id) throw new Error('Could not create or find a timetable subject.');
        const end = candidate.endTime ? localExamTimeToUtc(date, candidate.endTime, localTimeZone()).iso : null;
        const exam = await callApi('POST', { resource: 'exams', subject_id: subject.id, title: candidate.title || 'Exam', exam_at: local.iso, timezone: localTimeZone(), end_at: end, venue: candidate.venue, source_import_id: draftImport.id });
        for (const [position, title] of candidate.topics.entries()) if (title.trim()) await callApi('POST', { resource: 'topics', exam_id: exam.id, title, position, source: 'timetable' });
      }
      await callApi('PATCH', { resource: 'imports', id: draftImport.id, status: 'confirmed' });
      setDraft(null); setDraftCandidates([]); setDraftImport(null); setView('Upcoming exams');
    }, `${candidates.length} reviewed exam${candidates.length === 1 ? '' : 's'} saved.`);
  }

  async function saveReminderPreferences(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const offsets = [10080, 4320, 1440, 120].filter(value => form.get(`offset-${value}`) === 'on');
    await run(() => callApi('POST', { resource: 'preferences', enabled: form.get('enabled') === 'on', offsets_minutes: offsets, all_subjects: allReminderSubjects, selected_subject_ids: allReminderSubjects ? [] : reminderSubjectIds, daily_digest: false, timezone: localTimeZone(), include_notes: false }), 'Reminder preferences saved.');
  }

  async function generatePlan() {
    if (!activeExam) return;
    const planned = createStudyPlan(activeExam, examTopics, dailyMinutes, sessionMinutes, new Date(), localTimeZone());
    if (!planned.length) { setNotice('Add incomplete topics and choose a future exam to create a study plan.'); return; }
    await run(async () => {
      const sessions = planned.map(session => ({ exam_id: activeExam.id, title: `Review ${examTopics.find(topic => topic.id === session.topicIds[0])?.title ?? 'exam topics'}`, topic_id: session.topicIds[0], session_at: localExamTimeToUtc(session.date, '18:00', localTimeZone()).iso, duration_minutes: Math.min(session.minutes, sessionMinutes) }));
      await callApi('POST', { resource: 'sessions', items: sessions });
    }, 'Estimated study sessions added to your calendar.');
  }

  if (busy) return <div className="academic-loading"><span className="academic-spinner"/> Loading Exam Planner…</div>;

  return <section className="academic-page exam-planner-page">
    <div className="page-intro"><div><span className="academic-kicker">PLAN WITH THE DATES YOU KNOW</span><h2>Exam Planner</h2><p>Review your timetable, organize topics, and prepare for each exam.</p></div><button className="academic-primary" onClick={() => setView('Upload timetable')}>＋ Upload timetable</button></div>
    <nav className="exam-planner-tabs" aria-label="Exam Planner views">{VIEWS.map(item => <button type="button" className={view === item ? 'active' : ''} key={item} onClick={() => setView(item)}>{item}</button>)}</nav>
    {error && <div className="academic-alert error" role="alert">{error} <button onClick={() => void reload()}>Retry</button></div>}{notice && <div className="academic-alert success" role="status">{notice}</div>}
    {view === 'Dashboard' && <div className="exam-dashboard">
      <div className="exam-metric-grid"><article><small>NEXT EXAM</small><strong>{upcoming[0]?.title ?? 'No upcoming exams'}</strong><span>{upcoming[0] ? `${upcoming[0].subjectName ?? store.subjects.find(s => s.id === upcoming[0].subjectId)?.name ?? 'Subject'} · ${new Date(upcoming[0].examAt).toLocaleString()}` : 'Add a timetable or exam to get started.'}</span></article><article><small>TIME REMAINING</small><strong>{upcoming[0] ? countdown(upcoming[0].examAt) : '—'}</strong><span>Based on saved exam dates</span></article><article><small>TOPICS TO REVIEW</small><strong>{store.topics.filter(topic => !topic.completed).length}</strong><span>Saved, incomplete topics</span></article><article><small>REMINDERS</small><strong>{preferences.enabled ? 'Enabled' : 'Off'}</strong><span>{reminderConfigured ? 'Provider setup may still be required' : 'Cloud setup required'}</span></article></div>
      <section className="academic-card"><div className="academic-card-heading"><div><span className="academic-kicker">YOUR SCHEDULE</span><h3>Upcoming exams</h3></div><button className="attendance-text-button" onClick={() => setView('Upcoming exams')}>View all</button></div>{upcoming.length ? upcoming.slice(0, 5).map(exam => <ExamRow key={exam.id} exam={exam} subjects={store.subjects} onSelect={() => { setSelectedExam(exam.id); setView('Subject details'); }}/>) : <Empty title="No upcoming exams" text="Upload a timetable or add an exam manually. Nothing has been prefilled." onClick={() => setView('Upload timetable')}/>}</section>
      <div className="exam-lower-grid"><section className="academic-card"><h3>Today&apos;s study tasks</h3>{store.sessions.filter(session => formatLocalInputs(String(session.session_at), localTimeZone()).date === todayLocal).length ? store.sessions.filter(session => formatLocalInputs(String(session.session_at), localTimeZone()).date === todayLocal).map(session => <p key={String(session.id)}>{String(session.title)} · {String(session.duration_minutes)} min</p>) : <p className="muted-copy">No study sessions scheduled today.</p>}</section><section className="academic-card"><h3>Subjects to prepare</h3>{preparationSubjects.length ? preparationSubjects.map(item => <p key={item.subject.id}>{item.subject.name} · {item.remaining} topics remaining</p>) : <p className="muted-copy">No incomplete exam topics are saved.</p>}</section><section className="academic-card"><h3>Recent schedule changes</h3>{recentScheduleChanges.length ? recentScheduleChanges.map(exam => <p key={exam.id}>{exam.title} · updated {new Date(exam.updatedAt).toLocaleString()}</p>) : <p className="muted-copy">No schedule changes yet.</p>}</section></div>
    </div>}
    {view === 'Upload timetable' && <div className="exam-upload-grid"><section className="academic-card"><h3>Upload timetable</h3><p className="muted-copy">PDF with selectable text, CSV, or XLSX workbook. JPG and PNG are recorded for manual entry. Maximum 10 MB. Scanned PDFs and images need manual entry because OCR is not configured.</p><label className="exam-file-picker">Choose timetable<input type="file" accept=".pdf,.csv,.xlsx,.jpg,.jpeg,.png,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadTimetable(file); event.currentTarget.value = ''; }}/></label>{fileMessage && <p className="exam-inline-note" role="status">{fileMessage}</p>}{draftImport && draft && <div className="exam-review"><h4>Review extracted information</h4><p>Nothing is saved as an exam until you confirm. Check the date, year, time, subject, and topics.</p><p className="exam-inline-note">Exam {draftIndex + 1} of {draftCandidates.length}</p><CandidateForm candidate={draft} setCandidate={updateDraft}/><div className="exam-button-row"><button type="button" className="academic-secondary" disabled={draftIndex === 0} onClick={() => { const next = draftIndex - 1; setDraftIndex(next); setDraft(draftCandidates[next]); }}>Previous exam</button><button type="button" className="academic-secondary" disabled={draftIndex + 1 >= draftCandidates.length} onClick={() => { const next = draftIndex + 1; setDraftIndex(next); setDraft(draftCandidates[next]); }}>Next exam</button></div>{draft.uncertainFields.length > 0 && <p className="exam-warning">Needs checking: {draft.uncertainFields.join(', ')}</p>}<div className="exam-button-row"><button type="button" className="academic-primary" disabled={saving} onClick={() => void confirmImport()}>Confirm and save exam</button><button type="button" className="academic-secondary" disabled={saving} onClick={() => void run(() => callApi('PATCH', { resource: 'imports', id: draftImport.id, status: 'discarded' }).then(() => { setDraft(null); setDraftImport(null); }), 'Import discarded.')}>Discard</button></div></div>}</section><section className="academic-card"><h3>Add an exam manually</h3><form className="academic-form" onSubmit={createExam}><label>Subject<select value={examSubject} onChange={event => setExamSubject(event.target.value)} required><option value="">Choose subject</option>{store.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}{subject.code ? ` · ${subject.code}` : ''}</option>)}</select></label><label>Exam title<input value={examTitle} onChange={event => setExamTitle(event.target.value)} maxLength={160} required/></label><div className="form-row"><label>Date<input type="date" value={examDate} onChange={event => setExamDate(event.target.value)} required/></label><label>Start time<input type="time" value={examTime} onChange={event => setExamTime(event.target.value)} required/></label></div><div className="form-row"><label>End time (optional)<input type="time" value={examEndTime} onChange={event => setExamEndTime(event.target.value)}/></label><label>Venue<input value={examVenue} onChange={event => setExamVenue(event.target.value)} maxLength={240}/></label></div><label>Instructions (optional)<textarea value={examInstructions} onChange={event => setExamInstructions(event.target.value)} maxLength={4000}/></label><small>Timezone: {localTimeZone()}</small><button className="academic-primary" disabled={saving || store.subjects.length === 0}>＋ Save exam</button>{store.subjects.length === 0 && <p className="exam-inline-note">Create an Exam Planner subject below first.</p>}</form><form className="academic-form exam-subject-form" onSubmit={createSubject}><h4>{editingSubjectId ? 'Edit subject' : 'Add a subject'}</h4><label>Name<input value={subjectName} onChange={event => setSubjectName(event.target.value)} required maxLength={120}/></label><div className="form-row"><label>Code<input value={subjectCode} onChange={event => setSubjectCode(event.target.value)} maxLength={40}/></label><label>Semester<input value={subjectSemester} onChange={event => setSubjectSemester(event.target.value)} maxLength={80}/></label></div><label>Faculty name (optional)<input value={subjectFaculty} onChange={event => setSubjectFaculty(event.target.value)} maxLength={120}/></label><label>Subject notes (optional)<textarea value={subjectNotes} onChange={event => setSubjectNotes(event.target.value)} maxLength={4000}/></label><div className="exam-button-row"><button className="academic-secondary" disabled={saving}>{editingSubjectId ? 'Save subject changes' : '＋ Save subject'}</button>{editingSubjectId && <button type="button" className="academic-secondary" onClick={() => { setEditingSubjectId(''); setSubjectName(''); setSubjectCode(''); setSubjectSemester(''); setSubjectFaculty(''); setSubjectNotes(''); }}>Cancel</button>}</div></form></section></div>}
    {view === 'Upcoming exams' && <section className="academic-card"><div className="academic-card-heading"><div><span className="academic-kicker">CONFIRMED SCHEDULE</span><h3>Upcoming exams</h3></div><button className="academic-primary" onClick={() => setView('Upload timetable')}>＋ Add exam</button></div>{upcoming.length ? upcoming.map(exam => <ExamRow key={exam.id} exam={exam} subjects={store.subjects} onSelect={() => { setSelectedExam(exam.id); setView('Subject details'); }}/>) : <Empty title="No upcoming exams" text="Your schedule is empty until you add or confirm exams." onClick={() => setView('Upload timetable')}/>}</section>}
    {view === 'Past exams' && <section className="academic-card"><div className="academic-card-heading"><div><span className="academic-kicker">COMPLETED OR CANCELLED</span><h3>Past exams</h3></div></div>{store.exams.filter(exam => exam.status === 'cancelled' || Date.parse(exam.examAt) < Date.now()).length ? store.exams.filter(exam => exam.status === 'cancelled' || Date.parse(exam.examAt) < Date.now()).map(exam => <ExamRow key={exam.id} exam={exam} subjects={store.subjects} onSelect={() => { setSelectedExam(exam.id); setView('Subject details'); }}/>) : <Empty title="No past exams" text="Completed exams will appear here after their saved dates pass."/>}</section>}
    {view === 'Subject details' && <div className="exam-details-grid"><section className="academic-card"><h3>Subject and exam details</h3>{store.subjects.length === 0 ? <Empty title="No subjects yet" text="Add a subject using the upload or manual entry form." onClick={() => setView('Upload timetable')}/> : <label className="exam-select-label">Choose exam<select value={activeExam?.id ?? ''} onChange={event => setSelectedExam(event.target.value)}>{store.exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {store.subjects.find(subject => subject.id === exam.subjectId)?.name}</option>)}</select></label>}{activeExam && <><div className="exam-button-row"><button type="button" className="academic-secondary" onClick={() => beginEditExam(activeExam)}>Edit or reschedule</button></div>{editingExam && <form className="academic-form" onSubmit={saveExamEdit}><label>Subject<select value={examSubject} onChange={event => setExamSubject(event.target.value)}>{store.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Exam title<input value={examTitle} onChange={event => setExamTitle(event.target.value)} required maxLength={160}/></label><div className="form-row"><label>Date<input type="date" value={examDate} onChange={event => setExamDate(event.target.value)} required/></label><label>Start time<input type="time" value={examTime} onChange={event => setExamTime(event.target.value)} required/></label></div><div className="form-row"><label>End time<input type="time" value={examEndTime} onChange={event => setExamEndTime(event.target.value)}/></label><label>Venue<input value={examVenue} onChange={event => setExamVenue(event.target.value)}/></label></div><label>Instructions<textarea value={examInstructions} onChange={event => setExamInstructions(event.target.value)}/></label><div className="exam-button-row"><button className="academic-primary" disabled={saving}>Save changes</button><button type="button" className="academic-secondary" onClick={() => setEditingExam(false)}>Cancel</button></div></form>}<h4>{activeExam.title}</h4><p>{store.subjects.find(subject => subject.id === activeExam.subjectId)?.name} · {new Date(activeExam.examAt).toLocaleString()} · {activeExam.timezone}</p><p>{activeExam.venue || 'Venue not entered'}</p><p>{activeExam.instructions || 'No instructions entered'}</p><div className="exam-button-row"><button className="academic-secondary" onClick={() => void run(() => callApi('PATCH', { resource: 'exams', id: activeExam.id, subject_id: activeExam.subjectId, title: activeExam.title, exam_at: activeExam.examAt, timezone: activeExam.timezone, end_at: activeExam.endAt, venue: activeExam.venue, instructions: activeExam.instructions, source_import_id: activeExam.sourceImportId, status: activeExam.status === 'cancelled' ? 'scheduled' : 'cancelled' }), activeExam.status === 'cancelled' ? 'Exam restored.' : 'Exam cancelled; pending reminders were stopped.')}>{activeExam.status === 'cancelled' ? 'Restore exam' : 'Cancel exam'}</button><button className="attendance-text-button" onClick={() => void run(() => callApi('DELETE', { resource: 'exams', id: activeExam.id }), 'Exam deleted.')}>Delete</button></div></>}{activeExam && <><h4>Topics <small>{examTopics.filter(topic => topic.completed).length}/{examTopics.length} complete</small></h4>{examTopics.map((topic, index) => <div className="exam-topic-row" key={topic.id}><input type="checkbox" checked={topic.completed} aria-label={`Mark ${topic.title} ${topic.completed ? 'incomplete' : 'complete'}`} onChange={() => void toggleTopic(topic)}/>{editingTopicId === topic.id ? <input value={editingTopicTitle} onChange={event => setEditingTopicTitle(event.target.value)} aria-label="Edit topic name"/> : <span className={topic.completed ? 'complete' : ''}>{topic.title}</span>}<small>{topic.source}</small>{editingTopicId === topic.id ? <button type="button" onClick={() => void saveTopicEdit(topic)}>Save</button> : <button type="button" onClick={() => { setEditingTopicId(topic.id); setEditingTopicTitle(topic.title); }}>Edit</button>}<button type="button" disabled={index === 0} aria-label="Move topic up" onClick={() => void run(() => callApi('PATCH', { resource: 'topics', id: topic.id, exam_id: topic.exam_id, title: topic.title, completed: topic.completed, source: topic.source, position: index - 1 }), 'Topic reordered.')}>↑</button><button type="button" disabled={index === examTopics.length - 1} aria-label="Move topic down" onClick={() => void run(() => callApi('PATCH', { resource: 'topics', id: topic.id, exam_id: topic.exam_id, title: topic.title, completed: topic.completed, source: topic.source, position: index + 1 }), 'Topic reordered.')}>↓</button><button type="button" aria-label={`Delete ${topic.title}`} onClick={() => void run(() => callApi('DELETE', { resource: 'topics', id: topic.id }), 'Topic removed.')}>×</button></div>)}<form className="exam-add-topic" onSubmit={addTopic}><input value={newTopic} onChange={event => setNewTopic(event.target.value)} placeholder="Add a topic manually" maxLength={240}/><button className="academic-secondary">Add topic</button></form></>}</section><section className="academic-card"><h3>Subjects</h3>{store.subjects.length ? store.subjects.map(subject => <article className="exam-subject-row" key={subject.id}><strong>{subject.name}</strong><span>{subject.code || 'No code'} · {subject.semester || 'Semester not set'}</span><small>{subject.facultyName || 'Faculty not set'}</small><div className="exam-button-row"><button type="button" className="attendance-text-button" onClick={() => editSubject(subject)}>Edit</button><button type="button" className="attendance-text-button" disabled={store.exams.some(exam => exam.subjectId === subject.id)} onClick={() => void deleteSubject(subject)}>Delete</button></div></article>) : <p className="muted-copy">No subjects saved yet.</p>}</section></div>}
    {view === 'Study plan' && <div className="exam-study-grid"><section className="academic-card"><h3>Estimated study plan</h3><p className="muted-copy">This plan distributes your incomplete topics across available days. It is an editable estimate, not a prediction of exam requirements.</p><label>Exam<select value={activeExam?.id ?? ''} onChange={event => setSelectedExam(event.target.value)}>{upcoming.map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {exam.subjectName ?? store.subjects.find(subject => subject.id === exam.subjectId)?.name}</option>)}</select></label><div className="form-row"><label>Study time each day (min)<input type="number" min="15" max="600" value={dailyMinutes} onChange={event => setDailyMinutes(Number(event.target.value))}/></label><label>Session length (min)<input type="number" min="5" max="240" value={sessionMinutes} onChange={event => setSessionMinutes(Number(event.target.value))}/></label></div><button className="academic-primary" disabled={!activeExam || pendingTopics === 0} onClick={() => void generatePlan()}>＋ Generate estimated sessions</button>{activeExam && createStudyPlan(activeExam, examTopics, dailyMinutes, sessionMinutes, new Date(), localTimeZone()).map(item => <article className="exam-session-row" key={item.date}><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString()}</strong><span>{examTopics.find(topic => topic.id === item.topicIds[0])?.title} · {item.minutes} min estimate</span></article>)}</section><section className="academic-card"><h3>Saved study sessions</h3>{store.sessions.length ? store.sessions.map(session => <label className="exam-session-row" key={String(session.id)}><input type="checkbox" checked={session.completed === true} onChange={() => void run(() => callApi('PATCH', { resource: 'sessions', ...session, completed: session.completed !== true }), 'Study session updated.')}/><strong>{new Date(String(session.session_at)).toLocaleString()}</strong><span>{String(session.title)} · {String(session.duration_minutes)} min</span></label>) : <p className="muted-copy">No study sessions have been generated.</p>}</section></div>}
    {view === 'Calendar' && <section className="academic-card"><h3>Exam and study calendar</h3>{[...store.exams.filter(item => item.status === 'scheduled').map(item => ({ date: item.examAt, label: `Exam · ${item.title}` })), ...store.sessions.map(item => ({ date: String(item.session_at), label: `Study · ${String(item.title)}` }))].sort((a, b) => a.date.localeCompare(b.date)).map((item, index) => <article className="exam-calendar-row" key={`${item.date}-${index}`}><time>{new Date(item.date).toLocaleString()}</time><span>{item.label}</span></article>)}</section>}
    {view === 'Reminders' && <section className="academic-card exam-reminder-settings"><h3>Email reminder preferences</h3><p>Emails go only to the verified address on your signed-in Supabase account. Messages are reported as accepted only after the email provider confirms acceptance.</p><div className="exam-provider-state"><strong>Delivery setup</strong><span>{!deliveryStatus.supabaseConfigured ? 'Supabase cloud configuration and the manual migration are required.' : !deliveryStatus.emailProviderConfigured ? 'Supabase is configured. Resend API, verified sender, service key, or app URL setup is incomplete.' : !deliveryStatus.verifiedEmail ? 'Verify the email address on your Supabase account before sending.' : `Configured for ${deliveryStatus.email}.`}</span></div><form className="academic-form" onSubmit={event => void saveReminderPreferences(event)}><label className="exam-check"><input name="enabled" type="checkbox" defaultChecked={preferences.enabled === true}/> Enable email reminders</label><label className="exam-check"><input type="checkbox" checked={allReminderSubjects} onChange={event => setAllReminderSubjects(event.target.checked)}/> Send reminders for all subjects</label>{!allReminderSubjects && store.subjects.map(subject => <label className="exam-check" key={subject.id}><input type="checkbox" checked={reminderSubjectIds.includes(subject.id)} onChange={event => setReminderSubjectIds(ids => event.target.checked ? [...ids, subject.id] : ids.filter(id => id !== subject.id))}/>{subject.name}</label>)}{[[10080,'7 days before'],[4320,'3 days before'],[1440,'1 day before'],[120,'2 hours before']].map(([offset,label]) => <label className="exam-check" key={offset}><input name={`offset-${offset}`} type="checkbox" defaultChecked={Array.isArray(preferences.offsets_minutes) ? preferences.offsets_minutes.includes(offset) : true}/>{label} the exam</label>)}<small>Reminder delivery uses Supabase Cron, configured separately. Timing depends on the project scheduler and may be delayed.</small><button className="academic-primary" disabled={saving}>Save reminder preferences</button><button type="button" className="academic-secondary" disabled={saving || !deliveryStatus.emailProviderConfigured || !deliveryStatus.verifiedEmail} onClick={() => void run(() => callApi('POST', { resource: 'test-email' }), 'Test email accepted by provider.')}>Send a test email</button></form>{preferences.enabled === true && <button className="academic-secondary" onClick={() => void run(() => callApi('POST', { resource: 'preferences', enabled: false, offsets_minutes: [], timezone: localTimeZone() }), 'All exam reminders stopped.')}>Stop all reminders</button>}</section>}
    {view === 'Notification history' && <section className="academic-card"><h3>Notification history</h3>{store.history.length ? store.history.map(item => <article className="exam-calendar-row" key={String(item.id)}><time>{new Date(String(item.created_at)).toLocaleString()}</time><span>{String(item.status)}{item.diagnostic ? ` · ${String(item.diagnostic)}` : ''}</span></article>) : <Empty title="No email history" text="Reminder attempts will appear here after the delivery service is configured."/>}</section>}
    {store.imports.length > 0 && view === 'Upload timetable' && <section className="academic-card"><h3>Recent timetable imports</h3>{store.imports.slice(0, 8).map(item => <button className="exam-calendar-row exam-import-button" key={String(item.id)} disabled={item.status !== 'review'} onClick={() => { const parsed = Array.isArray(item.parsed_data) ? item.parsed_data as Candidate[] : [blankCandidate()]; setDraftImport(item); setDraftCandidates(parsed); setDraftIndex(0); setDraft(parsed[0] ?? blankCandidate()); setView('Upload timetable'); }}><span>{String(item.source_name)}</span><small>{String(item.status)} · {new Date(String(item.created_at)).toLocaleString()}</small></button>)}</section>}
  </section>;
}

function blankCandidate(): Candidate { return { subject: '', code: '', title: '', date: '', dateEvidence: '', startTime: '', endTime: '', venue: '', topics: [], uncertainFields: ['subject', 'date', 'time'] }; }
function formatLocalInputs(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${fields.year}-${fields.month}-${fields.day}`, time: `${fields.hour}:${fields.minute}` };
}
function csvCandidates(rows: string[][]): Candidate[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map(value => value.toLowerCase().replace(/[^a-z]/g, ''));
  const find = (...names: string[]) => headers.findIndex(value => names.includes(value));
  const subject = find('subject', 'course', 'paper'); const date = find('date', 'examdate'); const time = find('time', 'starttime', 'start');
  if (subject < 0 || date < 0) throw new Error('CSV needs a subject and date column.');
  return rows.slice(1, 101).map(row => {
    const rawDate = row[date] ?? ''; const parsed = parseUnambiguousDate(rawDate);
    const topicsIndex = find('topics', 'syllabus'); const uncertainFields = parsed.needsReview ? ['date'] : [];
    if (!row[time]) uncertainFields.push('time');
    return { subject: row[subject] ?? '', code: row[find('code', 'subjectcode')] ?? '', title: row[find('title', 'examtype', 'type')] ?? 'Exam', date: parsed.date ?? '', dateEvidence: parsed.date ? '' : rawDate, startTime: row[time] ?? '', endTime: row[find('endtime', 'end')] ?? '', venue: row[find('venue', 'location')] ?? '', topics: topicsIndex < 0 ? [] : (row[topicsIndex] ?? '').split(/[;|]/).map(value => value.trim()).filter(Boolean), uncertainFields };
  });
}
function countdown(value: string) { const diff = Date.parse(value) - Date.now(); if (diff <= 0) return 'Started'; return `${Math.floor(diff / 86_400_000)}d ${Math.floor(diff % 86_400_000 / 3_600_000)}h`; }
function CandidateForm({ candidate, setCandidate }: { candidate: Candidate; setCandidate: (item: Candidate) => void }) {
  const update = (field: keyof Candidate, value: string) => setCandidate({ ...candidate, [field]: value });
  return <div className="academic-form"><label>Subject<input value={candidate.subject} onChange={event => update('subject', event.target.value)}/></label><label>Subject code<input value={candidate.code} onChange={event => update('code', event.target.value)}/></label><label>Exam title<input value={candidate.title} onChange={event => update('title', event.target.value)}/></label>{candidate.dateEvidence && <p className="exam-warning">Date text from file: {candidate.dateEvidence}. Confirm the month, day, and year manually.</p>}<div className="form-row"><label>Date<input type="date" value={candidate.date} onChange={event => update('date', event.target.value)}/></label><label>Start time<input type="time" value={candidate.startTime} onChange={event => update('startTime', event.target.value)}/></label></div><div className="form-row"><label>End time<input type="time" value={candidate.endTime} onChange={event => update('endTime', event.target.value)}/></label><label>Venue<input value={candidate.venue} onChange={event => update('venue', event.target.value)}/></label></div><label>Topics listed in the source (one per line)<textarea value={candidate.topics.join('\n')} onChange={event => setCandidate({ ...candidate, topics: event.target.value.split('\n').slice(0, 50) })}/></label><small>Topics are not generated from a subject name. Leave blank when the source has none.</small></div>;
}
function ExamRow({ exam, subjects, onSelect }: { exam: PlannedExam; subjects: ExamSubject[]; onSelect: () => void }) {
  return <button className="exam-list-row" onClick={onSelect}><span><strong>{exam.title}</strong><small>{exam.subjectName ?? subjects.find(subject => subject.id === exam.subjectId)?.name ?? 'Subject'}</small></span><time>{new Date(exam.examAt).toLocaleString()}</time><Icon name="chevron" size={16}/></button>;
}
function Empty({ title, text, onClick }: { title: string; text: string; onClick?: () => void }) { return <div className="exam-empty"><span>✳</span><strong>{title}</strong><p>{text}</p>{onClick && <button className="academic-secondary" onClick={onClick}>Get started</button>}</div>; }
