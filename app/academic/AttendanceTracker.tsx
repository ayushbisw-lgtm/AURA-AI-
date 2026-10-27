'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { hasSupabaseConfig } from '@/lib/supabase/config';
import { AttendanceSession, AttendanceStatus, AttendanceSubject, planAttendance, summarizeAttendance, validateSubject } from '@/lib/attendance';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; };
function errorMessage(error: { message?: string; code?: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205') return 'Attendance tables are not installed yet. Apply supabase/migrations/20261027000000_create_attendance_tracker.sql in Supabase SQL Editor.';
  if (error.code === '23505') return 'That subject or session already exists. Edit the existing record to correct it.';
  if (error.code === '42501' || error.code === 'PGRST301') return 'Your signed-in session cannot access this record. Sign in again and retry.';
  return error.message || 'Supabase could not complete this attendance request.';
}

export default function AttendanceTracker({ userId, onAddSubject }: { userId: string; onAddSubject?: () => void }) {
  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [subjectForm, setSubjectForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState('');
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [faculty, setFaculty] = useState(''); const [semester, setSemester] = useState('');
  const [target, setTarget] = useState('75'); const [scheduleDays, setScheduleDays] = useState<number[]>([]); const [scheduleTime, setScheduleTime] = useState('09:00');
  const [subjectId, setSubjectId] = useState(''); const [date, setDate] = useState(today()); const [sessionNumber, setSessionNumber] = useState('1'); const [status, setStatus] = useState<AttendanceStatus>('present'); const [notes, setNotes] = useState(''); const [editingSession, setEditingSession] = useState('');
  const [historySubject, setHistorySubject] = useState(''); const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    if (!hasSupabaseConfig()) { setSubjects([]); setSessions([]); setBusy(false); return; }
    const client = createSupabaseBrowserClient();
    const [subjectResult, sessionResult] = await Promise.all([
      client.from('attendance_subjects').select('id,name,code,faculty_name,semester,target_percentage,weekly_schedule').eq('user_id', userId).order('name'),
      client.from('attendance_sessions').select('id,subject_id,session_date,session_number,status,notes').eq('user_id', userId).order('session_date', { ascending: false }).order('session_number')
    ]);
    if (subjectResult.error) throw new Error(errorMessage(subjectResult.error));
    if (sessionResult.error) throw new Error(errorMessage(sessionResult.error));
    setSubjects((subjectResult.data ?? []) as AttendanceSubject[]); setSessions((sessionResult.data ?? []) as AttendanceSession[]);
  }, [userId]);
  useEffect(() => { let active = true; setBusy(true); refresh().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load attendance.'); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [refresh]);

  const overall = summarizeAttendance(sessions);
  const selected = subjects.find(item => item.id === subjectId);
  const filteredHistory = useMemo(() => sessions.filter(item => (!historySubject || item.subject_id === historySubject) && (!fromDate || item.session_date >= fromDate) && (!toDate || item.session_date <= toDate)), [sessions, historySubject, fromDate, toDate]);
  const upcomingClasses = useMemo(() => {
    const now = new Date();
    return subjects.flatMap(item => item.weekly_schedule.map(schedule => {
      for (let offset = 0; offset < 8; offset++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        if (d.getDay() !== schedule.day) continue;
        const classDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (offset === 0 && schedule.time <= `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`) continue;
        return { subject: item.name, date: classDate, time: schedule.time };
      }
      return null;
    }).filter((entry): entry is { subject: string; date: string; time: string } => entry !== null)).sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0,8);
  }, [subjects]);
  async function perform(action: () => Promise<void>, message: string) { setError(''); setNotice(''); setSaving(true); try { await action(); await refresh(); setNotice(message); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save attendance.'); } finally { setSaving(false); } }

  function resetSubject() { setEditingSubject(''); setName(''); setCode(''); setFaculty(''); setSemester(''); setTarget('75'); setScheduleDays([]); setScheduleTime('09:00'); }
  function editSubject(item: AttendanceSubject) { setEditingSubject(item.id); setName(item.name); setCode(item.code); setFaculty(item.faculty_name ?? ''); setSemester(item.semester); setTarget(String(item.target_percentage)); setScheduleDays(item.weekly_schedule.map(x => x.day)); setScheduleTime(item.weekly_schedule[0]?.time ?? '09:00'); setSubjectForm(true); }
  async function saveSubject(event: FormEvent) {
    event.preventDefault();
    try { validateSubject({ name, code, semester, target: Number(target) }); } catch (e) { setError(e instanceof Error ? e.message : 'Check the subject details.'); return; }
    const payload = { user_id: userId, name: name.trim(), code: code.trim(), faculty_name: faculty.trim() || null, semester: semester.trim(), target_percentage: Number(target), weekly_schedule: scheduleDays.map(day => ({ day, time: scheduleTime })) };
    await perform(async () => {
      const client = createSupabaseBrowserClient();
      const result = editingSubject ? await client.from('attendance_subjects').update(payload).eq('id', editingSubject).eq('user_id', userId).select('id').maybeSingle() : await client.from('attendance_subjects').insert(payload).select('id').single();
      if (result.error) throw new Error(errorMessage(result.error));
      if (!result.data) throw new Error('This subject could not be found in your account. Refresh and try again.');
      setSubjectForm(false); resetSubject();
    }, editingSubject ? 'Subject updated.' : 'Subject added.');
  }
  async function removeSubject(item: AttendanceSubject) {
    if (!window.confirm(`Delete ${item.name} and all its attendance sessions? This cannot be undone.`)) return;
    await perform(async () => { const { error: deleteError } = await createSupabaseBrowserClient().from('attendance_subjects').delete().eq('id', item.id).eq('user_id', userId); if (deleteError) throw new Error(errorMessage(deleteError)); }, 'Subject and its sessions deleted.');
  }
  function editSession(item: AttendanceSession) { setEditingSession(item.id); setSubjectId(item.subject_id); setDate(item.session_date); setSessionNumber(String(item.session_number)); setStatus(item.status); setNotes(item.notes ?? ''); }
  async function saveSession(event: FormEvent) {
    event.preventDefault(); setError('');
    const number = Number(sessionNumber);
    if (!selected) { setError('Select a subject.'); return; }
    if (!date || date > today()) { setError('Choose today or a past date.'); return; }
    if (!Number.isInteger(number) || number < 1 || number > 20) { setError('Session number must be from 1 to 20.'); return; }
    if (notes.length > 500) { setError('Notes must be 500 characters or fewer.'); return; }
    await perform(async () => {
      const client = createSupabaseBrowserClient();
      const payload = { user_id: userId, subject_id: subjectId, session_date: date, session_number: number, status, notes: notes.trim() || null };
      const result = editingSession ? await client.from('attendance_sessions').update(payload).eq('id', editingSession).eq('user_id', userId).select('id').maybeSingle() : await client.from('attendance_sessions').insert(payload).select('id').single();
      if (result.error) throw new Error(errorMessage(result.error));
      if (!result.data) throw new Error('This session could not be found in your account. Refresh and try again.');
      setEditingSession(''); setNotes('');
    }, editingSession ? 'Attendance corrected.' : 'Attendance saved.');
  }
  async function deleteSession(item: AttendanceSession) {
    if (!window.confirm('Delete this attendance session?')) return;
    await perform(async () => { const { error: deleteError } = await createSupabaseBrowserClient().from('attendance_sessions').delete().eq('id', item.id).eq('user_id', userId); if (deleteError) throw new Error(errorMessage(deleteError)); }, 'Session deleted.');
  }

  if (!hasSupabaseConfig()) return <section className="attendance-page"><div className="attendance-alert" role="alert"><strong>Supabase setup required</strong><p>Attendance is saved only to Supabase. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY), then apply the attendance migration in Supabase SQL Editor. No records have been saved.</p></div></section>;
  if (busy) return <div className="academic-loading"><span className="academic-spinner"/> Loading attendance from Supabase…</div>;
  return <section className="attendance-page">
    <header className="attendance-heading"><div><span className="dashboard-eyebrow">ACADEMIC TRACKER</span><h2>Attendance</h2><p>Track sessions recorded in your signed-in Supabase account.</p></div><button type="button" className="academic-primary" onClick={() => { resetSubject(); setSubjectForm(true); }}>＋ Add subject</button></header>
    {error && <div className="attendance-alert" role="alert">{error}<button type="button" onClick={() => { setBusy(true); refresh().catch(e => setError(e.message)).finally(() => setBusy(false)); }}>Retry</button></div>}{notice && <div className="attendance-notice" role="status">{notice}</div>}
    {subjects.length === 0 && <div className="attendance-empty"><h3>No subjects yet</h3><p>Add your subjects to start recording attendance. Your dashboard will use only saved sessions.</p><button className="academic-primary" type="button" onClick={() => { resetSubject(); setSubjectForm(true); }}>Add your first subject</button>{onAddSubject && <button className="attendance-text-button" type="button" onClick={onAddSubject}>Open courses &amp; semesters</button>}</div>}
    {subjects.length > 0 && <>
      <div className="attendance-stats"><article><small>Overall attendance</small><strong>{overall.percentage === null ? '—' : `${overall.percentage.toFixed(1)}%`}</strong><span>Calculated from saved sessions</span></article><article><small>Conducted</small><strong>{overall.conducted}</strong><span>{overall.present} present · {overall.absent} absent</span></article><article><small>Cancelled</small><strong>{overall.cancelled}</strong><span>Excluded from percentage</span></article><article><small>Total records</small><strong>{overall.total}</strong><span>Saved sessions</span></article></div>
      {upcomingClasses.length > 0 && <section className="attendance-panel attendance-upcoming"><div><h3>Upcoming classes</h3><p>Estimated from your weekly schedule.</p></div><div className="attendance-upcoming-list">{upcomingClasses.map((item,index) => <article key={`${item.subject}-${item.date}-${item.time}-${index}`}><strong>{item.subject}</strong><span>{item.date} · {item.time}</span></article>)}</div></section>}
      <div className="attendance-section-title"><div><h3>Subjects</h3><p>Each subject uses its own attendance target.</p></div></div>
      <div className="attendance-subject-grid">{subjects.map(item => { const summary = summarizeAttendance(sessions.filter(session => session.subject_id === item.id)); const pct = summary.percentage; const low = pct !== null && pct < item.target_percentage; return <article className="attendance-subject-card" key={item.id}><div className="attendance-subject-title"><div><h4>{item.name}</h4><p>{item.code || 'No code'} · {item.semester}{item.faculty_name ? ` · ${item.faculty_name}` : ''}</p></div><div className="attendance-card-actions"><button type="button" aria-label={`Edit ${item.name}`} onClick={() => editSubject(item)}>Edit</button><button type="button" aria-label={`Delete ${item.name}`} onClick={() => removeSubject(item)}>Delete</button></div></div><div className="attendance-meter-label"><strong>{pct === null ? 'No classes recorded' : `${pct.toFixed(1)}%`}</strong><span>Target {item.target_percentage}%</span></div><div className="attendance-meter" role="meter" aria-label={`${item.name} attendance`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}><span className={low ? 'low' : ''} style={{ width: `${pct ?? 0}%` }}/></div><p className={low ? 'attendance-warning' : 'attendance-counts'}>{low ? `Below target by ${(item.target_percentage - (pct ?? 0)).toFixed(1)} points` : `${summary.present} present · ${summary.absent} absent · ${summary.cancelled} cancelled`}</p>{item.weekly_schedule.length > 0 && <small className="attendance-schedule">Schedule: {item.weekly_schedule.map(x => `${DAYS[x.day]} ${x.time}`).join(' · ')}</small>}</article>; })}</div>
      <div className="attendance-work-grid"><form className="attendance-panel attendance-form" onSubmit={saveSession}><div><h3>{editingSession ? 'Correct attendance' : 'Mark attendance'}</h3><p>Session number distinguishes multiple classes on the same day.</p></div><label>Subject<select value={subjectId} onChange={e => setSubjectId(e.target.value)} required><option value="">Select subject</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><div className="attendance-fields"><label>Date<input type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} required/></label><label>Session no.<input type="number" min="1" max="20" value={sessionNumber} onChange={e => setSessionNumber(e.target.value)} required/></label></div><label>Status<select value={status} onChange={e => setStatus(e.target.value as AttendanceStatus)}><option value="present">Present</option><option value="absent">Absent</option><option value="cancelled">Cancelled</option></select></label><label>Notes (optional)<textarea maxLength={500} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a short note"/></label><div className="attendance-actions"><button className="academic-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editingSession ? 'Save correction' : 'Save session'}</button>{editingSession && <button className="attendance-secondary" type="button" onClick={() => { setEditingSession(''); setNotes(''); }}>Cancel edit</button>}</div><small>Percentages are calculated from records in Supabase; cancelled sessions are excluded.</small></form>
        <section className="attendance-panel attendance-planner"><h3>Attendance planner</h3><p>Uses the selected subject’s target and recorded totals.</p>{!selected ? <p>Select a subject above to see its plan.</p> : (() => { const summary = summarizeAttendance(sessions.filter(s => s.subject_id === selected.id)); const plan = planAttendance(summary.present, summary.conducted, selected.target_percentage); return <div className="attendance-plan-result"><strong>{summary.percentage !== null && summary.percentage >= selected.target_percentage ? 'Target reached' : plan.reachable ? `${plan.minimumToReach} consecutive classes` : 'Target cannot be reached with finite classes'}</strong><span>{summary.percentage !== null && summary.percentage >= selected.target_percentage ? 'You are currently at or above target.' : plan.reachable ? `Attend at least ${plan.minimumToReach} future classes consecutively to reach ${selected.target_percentage}%.` : `At a ${selected.target_percentage}% target, attend every future class; a perfect record is required.`}</span><span>{plan.additionalMisses === null ? selected.target_percentage === 0 ? 'There is no attendance minimum, so additional misses are unrestricted.' : 'No future absences are safe at this target.' : `You can miss up to ${plan.additionalMisses} additional class${plan.additionalMisses === 1 ? '' : 'es'} while remaining at target.`}</span>{summary.percentage !== null && summary.percentage < selected.target_percentage && <em>Below target now. Recovery requires attending future classes.</em>}<small>Planner values are estimates based on a steady sequence of future conducted classes. Cancelled sessions do not affect the totals.</small></div>; })()}</section></div>
      <section className="attendance-panel attendance-history"><div className="attendance-history-heading"><div><h3>Attendance history</h3><p>Review and correct saved sessions.</p></div><div className="attendance-filters"><label>Subject<select value={historySubject} onChange={e => setHistorySubject(e.target.value)}><option value="">All subjects</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}/></label><label>To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)}/></label></div></div>{filteredHistory.length ? <div className="attendance-history-list">{filteredHistory.map(item => <article key={item.id}><div><strong>{subjects.find(s => s.id === item.subject_id)?.name ?? 'Subject'}</strong><span>{item.session_date} · Session {item.session_number}</span></div><span className={`attendance-badge ${item.status}`}>{item.status}</span>{item.notes && <p>{item.notes}</p>}<div className="attendance-card-actions"><button type="button" onClick={() => editSession(item)}>Edit</button><button type="button" onClick={() => deleteSession(item)}>Delete</button></div></article>)}</div> : <div className="attendance-history-empty">No saved sessions match these filters.</div>}</section>
    </>}
    {subjectForm && <div className="attendance-dialog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSubjectForm(false); }}><form className="attendance-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-subject-dialog-title" onSubmit={saveSubject}><h3 id="attendance-subject-dialog-title">{editingSubject ? 'Edit subject' : 'Add subject'}</h3><label>Subject name<input autoFocus maxLength={100} value={name} onChange={e => setName(e.target.value)} required/></label><label>Subject code<input maxLength={30} value={code} onChange={e => setCode(e.target.value)}/></label><label>Faculty name (optional)<input maxLength={100} value={faculty} onChange={e => setFaculty(e.target.value)}/></label><div className="attendance-fields"><label>Semester<input maxLength={40} value={semester} onChange={e => setSemester(e.target.value)} placeholder="e.g. Semester 3" required/></label><label>Target %<input type="number" min="0" max="100" step="0.1" value={target} onChange={e => setTarget(e.target.value)} required/></label></div><fieldset><legend>Weekly schedule (optional)</legend><div className="attendance-days">{DAYS.map((day,index) => <label key={day}><input type="checkbox" checked={scheduleDays.includes(index)} onChange={e => setScheduleDays(current => e.target.checked ? [...current,index].sort() : current.filter(d => d !== index))}/>{day}</label>)}</div>{scheduleDays.length > 0 && <label>Class time<input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} required/></label>}</fieldset>{error && <p className="attendance-form-error" role="alert">{error}</p>}<div className="attendance-actions"><button className="academic-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editingSubject ? 'Save subject' : 'Add subject'}</button><button type="button" className="attendance-secondary" onClick={() => { setSubjectForm(false); resetSubject(); }}>Cancel</button></div></form></div>}
  </section>;
}
