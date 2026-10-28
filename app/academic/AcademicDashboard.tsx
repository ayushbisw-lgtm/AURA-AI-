'use client';

import { FormEvent, ReactNode, useMemo, useState } from 'react';
import type { AcademicData, AcademicTask, AcademicTaskKind } from '@/lib/academic-types';
import { saveAcademicRecord } from '@/lib/academic-store';

export type AcademicSection = 'overview' | 'courses' | 'materials' | 'ask' | 'exams' | 'planner' | 'exam-planner' | 'attendance' | 'notices' | 'settings';
export type ExamFormat = 'mcq' | 'short-answer' | 'flashcards' | 'mock-paper';
export type AcademicAction = { section: AcademicSection | 'chat'; prompt?: string; format?: ExamFormat; date?: string };
export type ProviderStatus = 'checking' | 'online' | 'offline';

type Props = {
  data: AcademicData;
  providerStatus: ProviderStatus;
  modelName: string;
  selectedSubjectId: string;
  onSubjectChange: (id: string) => void;
  onNavigate: (action: AcademicAction) => void;
  runAction: (action: () => Promise<void>, success?: string) => Promise<void>;
};

type IconName = 'home' | 'help' | 'bulb' | 'quiz' | 'questions' | 'path' | 'cards' | 'notes' | 'pdf' | 'mind' | 'lecture' | 'research' | 'exam' | 'language' | 'chat' | 'settings' | 'calendar' | 'clock' | 'check' | 'plus' | 'arrow' | 'chevron' | 'book' | 'spark' | 'fire' | 'target' | 'user' | 'upload' | 'trend' | 'close' | 'database';

const iconContent: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.2 1.8c-1 .9-1.8 1.2-1.8 2.7M12 17h.01"/></>,
  bulb: <><path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.8.7-1.2 1.5-1.3 2.5h-4.4c-.1-1-.5-1.8-1.3-2.5Z"/></>,
  quiz: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h3M8 16h2M15 13l1.2 1.2L19 11"/></>,
  questions: <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".7"/><circle cx="3.5" cy="12" r=".7"/><circle cx="3.5" cy="18" r=".7"/></>,
  path: <><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/></>,
  cards: <><rect x="4" y="5" width="14" height="16" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v12M8 10h6M8 14h6"/></>,
  notes: <><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/></>,
  pdf: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M8.5 15h1.2a1.5 1.5 0 0 0 0-3H8.5v5M13 17v-5h1a2.5 2.5 0 0 1 0 5h-1M18 12h-2v5M16 14.5h1.5"/></>,
  mind: <><circle cx="12" cy="12" r="2.2"/><circle cx="5" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/><path d="m10.5 10.5-4-4m7 4 4-4m-7 7-4 4m7-4 4 4"/></>,
  lecture: <><rect x="3" y="5" width="18" height="13" rx="2"/><path d="m10 9 5 2.5-5 2.5zM8 21h8M12 18v3"/></>,
  research: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5l1.7 1.7 3.3-3.5"/></>,
  exam: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4M16 16h.01"/></>,
  language: <><path d="M4 5h10M9 3v2c0 5-2 8-5 10M6 9c1.5 2 3.5 3.7 6 5M13 20l4-10 4 10M14.5 17h5"/></>,
  chat: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 4a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.2 1-1.2 2.1-1.5-.5a8 8 0 0 1-1.6.9l-.3 1.6h-2.4l-.3-1.6a8 8 0 0 1-1.6-.9l-1.5.5-1.2-2.1 1.2-1a8 8 0 0 1 0-1.8l-1.2-1 1.2-2.1 1.5.5a8 8 0 0 1 1.6-.9l.3-1.6h2.4l.3 1.6a8 8 0 0 1 1.6.9l1.5-.5 1.2 2.1-1.2 1a8 8 0 0 1-.1 1.8Z" transform="translate(-1 -1)"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 5v17M8 7h8"/></>,
  spark: <><path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5z"/><path d="m19 14 1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/></>,
  fire: <><path d="M12 22c4 0 7-2.9 7-7 0-3.3-2.1-5.3-4.8-8-.1 2-1.1 3-2.2 3.5.4-3.3-.9-6.1-3.5-8.5C8.9 6.4 5 9.5 5 15c0 4.1 3 7 7 7Z"/><path d="M12 22c-1.5 0-2.5-1.1-2.5-2.7 0-1.2.8-2.4 2.3-3.8.1 1.2.9 1.8 1.7 2.4.5.4 1 1.1 1 1.8 0 1.3-1 2.3-2.5 2.3Z"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></>,
  trend: <><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></>,
  close: <path d="m18 6-12 12M6 6l12 12"/>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></>
};

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconContent[name]}</svg>;
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayDate() {
  return localDate(new Date());
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const quickActions: { title: string; description: string; icon: IconName; color: string; action: AcademicAction }[] = [
  { title: 'Ask a question', description: 'Get answers from your study material', icon: 'help', color: 'violet', action: { section: 'ask' } },
  { title: 'PDF reader', description: 'Add and explore course documents', icon: 'pdf', color: 'blue', action: { section: 'materials' } },
  { title: 'Practice quiz', description: 'Build a focused multiple-choice set', icon: 'quiz', color: 'peach', action: { section: 'exams', format: 'mcq' } },
  { title: 'Mind map', description: 'Create a text outline from your notes', icon: 'mind', color: 'mint', action: { section: 'ask', prompt: 'Create a text-only mind map of my study material about: ' } },
  { title: 'Learning path', description: 'Plan the next steps in your studies', icon: 'path', color: 'lilac', action: { section: 'planner' } },
  { title: 'Settings', description: 'Review your local study workspace', icon: 'settings', color: 'sky', action: { section: 'settings' } }
];

const taskKindLabel: Record<AcademicTaskKind, string> = { exam: 'Exam', goal: 'Goal', syllabus: 'Syllabus', revision: 'Revision' };

export default function AcademicDashboard({ data, providerStatus, modelName, selectedSubjectId, onSubjectChange, onNavigate, runAction }: Props) {
  const today = todayDate();
  const [goalTitle, setGoalTitle] = useState('');
  const [goalError, setGoalError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const todayTasks = useMemo(() => data.tasks.filter(task => task.kind === 'goal' && task.dueDate === today)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [data.tasks, today]);
  const pendingGoals = todayTasks.filter(task => !task.completed).length;

  async function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGoalError('');
    const title = goalTitle.trim();
    const subjectId = selectedSubjectId || data.subjects[0]?.id;
    if (!title) return;
    if (!subjectId) { setGoalError('Add a subject before creating a study goal.'); return; }
    const task: AcademicTask = { id: makeId(), title: title.slice(0, 160), kind: 'goal', subjectId, dueDate: today, completed: false, progress: 0, createdAt: new Date().toISOString() };
    await runAction(() => saveAcademicRecord('tasks', task), 'Today’s goal added.');
    setGoalTitle('');
  }

  async function toggleGoal(task: AcademicTask) {
    await runAction(() => saveAcademicRecord('tasks', { ...task, completed: !task.completed }), task.completed ? 'Goal reopened.' : 'Goal completed.');
  }

  return <div className="dashboard-layout">
    <div className="dashboard-main-column">
      <section className="wisdom-banner" aria-label="Daily inspiration">
        <div className="wisdom-panel"><span className="banner-overline"><Icon name="spark" size={14}/> DAILY WISDOM</span><p>“A little progress each day adds up to big results.”</p><small>A reminder to keep showing up for your learning.</small></div>
        <div className="banner-divider"/>
        <div className="formula-panel"><span className="banner-overline"><Icon name="target" size={14}/> PRODUCTIVITY FORMULA</span><p><strong>25 min focus</strong><span>+</span><strong>5 min reset</strong><span>+</span><strong>one clear goal</strong></p><small>Short, focused sessions make it easier to begin.</small></div>
        <div className="banner-orbit orbit-one"/><div className="banner-orbit orbit-two"/>
      </section>

      <section className="dashboard-section quick-section"><div className="section-heading"><div><span className="dashboard-eyebrow">MAKE YOUR NEXT MOVE</span><h2>Quick actions</h2></div><button className="text-link" onClick={() => onNavigate({ section: 'courses' })}>Manage courses <Icon name="arrow" size={15}/></button></div>
        <div className="quick-grid">{quickActions.map(item => <button className={`quick-card ${item.color}`} key={item.title} onClick={() => onNavigate(item.action)}><span className="quick-icon"><Icon name={item.icon} size={19}/></span><span className="quick-copy"><strong>{item.title}</strong><small>{item.description}</small></span><Icon className="quick-arrow" name="arrow" size={15}/></button>)}</div>
      </section>

      <div className="dashboard-mid-grid">
        <section className="dashboard-card streak-card"><div className="card-title-row"><div><span className="dashboard-eyebrow">YOUR RHYTHM</span><h3>Study streak</h3></div><span className="streak-icon"><Icon name="fire" size={19}/></span></div><div className="streak-summary"><div><strong>—</strong><span>days in a row</span></div><p>Study sessions aren’t tracked yet, so a streak can’t be calculated.</p></div><div className="week-activity" aria-label="No weekly study sessions tracked">{['M','T','W','T','F','S','S'].map((day, index) => <div className="activity-day" key={`${day}-${index}`}><span className="activity-dot"/><small>{day}</small></div>)}</div><button className="subtle-link" onClick={() => onNavigate({ section: 'planner' })}>Plan a study session <Icon name="arrow" size={14}/></button></section>
        <section className="dashboard-card goals-card"><div className="card-title-row"><div><span className="dashboard-eyebrow">ONE STEP AT A TIME</span><h3>Today’s goals</h3></div><span className="goal-pending">{pendingGoals} pending</span></div><div className="goals-progress"><div><span style={{ width: `${todayTasks.length ? (todayTasks.length - pendingGoals) / todayTasks.length * 100 : 0}%` }}/></div><small>{todayTasks.length ? `${todayTasks.length - pendingGoals} of ${todayTasks.length} complete` : 'No goals added for today'}</small></div><div className="today-goal-list">{todayTasks.length === 0 ? <div className="mini-empty"><Icon name="check" size={18}/><span>Your list is clear. Add a small goal to get started.</span></div> : todayTasks.map(task => <label className={`today-goal ${task.completed ? 'complete' : ''}`} key={task.id}><input type="checkbox" checked={task.completed} onChange={() => void toggleGoal(task)}/><span className="goal-check"><Icon name="check" size={13}/></span><span className="goal-text">{task.title}<small>{data.subjects.find(subject => subject.id === task.subjectId)?.name || 'Subject'}</small></span></label>)}</div><form className="add-goal-form" onSubmit={event => void addGoal(event)}><label className="sr-only" htmlFor="today-goal-input">Add a goal for today</label><input id="today-goal-input" value={goalTitle} onChange={event => setGoalTitle(event.target.value)} placeholder="Add a goal for today…" maxLength={160}/><button type="submit" aria-label="Add today's goal" disabled={!goalTitle.trim()}><Icon name="plus" size={17}/></button></form>{goalError && <p className="dashboard-inline-error" role="alert">{goalError}</p>}</section>
      </div>

      <section className="dashboard-card history-card"><div className="card-title-row"><div><span className="dashboard-eyebrow">KEEP PRACTICING</span><h3>Practice history</h3></div><button className="text-link" onClick={() => onNavigate({ section: 'exams', format: 'mcq' })}>Practice quiz <Icon name="arrow" size={15}/></button></div><div className="history-empty"><span className="history-icon"><Icon name="trend" size={19}/></span><div><strong>No practice attempts yet</strong><p>Quiz attempts and scores aren’t saved in this version. Start a practice set to study; results won’t be recorded.</p></div><button className="outline-button" onClick={() => onNavigate({ section: 'exams', format: 'mcq' })}>Create a quiz</button></div></section>
    </div>

    <aside className="dashboard-right-column" aria-label="Study overview">
      <TutorCard data={data} status={providerStatus} modelName={modelName} selectedSubjectId={selectedSubjectId} onSubjectChange={onSubjectChange} onContinue={() => onNavigate({ section: 'ask' })}/>
      <StudyTools onNavigate={onNavigate}/>
      <CalendarCard data={data} month={calendarMonth} setMonth={setCalendarMonth} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onAddEvent={() => onNavigate({ section: 'planner', date: selectedDate, ...(selectedSubjectId ? {} : {}) })}/>
    </aside>
  </div>;
}

function TutorCard({ data, status, modelName, selectedSubjectId, onSubjectChange, onContinue }: {
  data: AcademicData; status: ProviderStatus; modelName: string; selectedSubjectId: string; onSubjectChange: (id: string) => void; onContinue: () => void;
}) {
  return <section className="tutor-card"><div className="tutor-heading"><span className="tutor-icon"><Icon name="spark" size={18}/></span><div><strong>AI Tutor</strong><small>Study with your material</small></div></div><div className="provider-status"><span className={`provider-dot ${status}`}/><span>{status === 'checking' ? 'Checking local model…' : status === 'online' ? `${modelName} ready` : 'Local model unavailable'}</span></div><label className="tutor-subject-label" htmlFor="tutor-subject">Study subject</label><select id="tutor-subject" className="tutor-subject" value={selectedSubjectId} onChange={event => onSubjectChange(event.target.value)} disabled={data.subjects.length === 0}><option value="">{data.subjects.length ? 'All subjects' : 'Add a subject first'}</option>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><div className="tutor-session"><span className="session-indicator"><Icon name="book" size={15}/></span><span><strong>Document Q&amp;A</strong><small>No active session</small></span></div><button className="tutor-continue" onClick={onContinue}>Continue to tutor <Icon name="arrow" size={15}/></button></section>;
}

function StudyTools({ onNavigate }: { onNavigate: (action: AcademicAction) => void }) {
  return <section className="study-tools-card"><div className="right-card-heading"><div><span className="dashboard-eyebrow">YOUR STUDY KIT</span><h3>Study tools</h3></div></div><button className="study-tool-row" onClick={() => onNavigate({ section: 'ask', prompt: 'Create concise summary notes about: ' })}><span className="tool-icon notes"><Icon name="notes" size={16}/></span><span><strong>Summary notes</strong><small>Outline key ideas from your files</small></span><Icon name="chevron" size={15}/></button><button className="study-tool-row" onClick={() => onNavigate({ section: 'exams', format: 'flashcards' })}><span className="tool-icon cards"><Icon name="cards" size={16}/></span><span><strong>Flashcards</strong><small>Generate cards for a topic</small></span><Icon name="chevron" size={15}/></button></section>;
}

function CalendarCard({ data, month, setMonth, selectedDate, setSelectedDate, onAddEvent }: {
  data: AcademicData; month: Date; setMonth: (date: Date) => void; selectedDate: string; setSelectedDate: (date: string) => void; onAddEvent: () => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const days = Array.from({ length: firstOffset + daysInMonth }, (_, index) => index < firstOffset ? null : index - firstOffset + 1);
  const tasksByDate = useMemo(() => data.tasks.reduce<Record<string, AcademicTask[]>>((result, task) => {
    (result[task.dueDate] ??= []).push(task);
    return result;
  }, {}), [data.tasks]);
  const selectedTasks = [...(tasksByDate[selectedDate] ?? [])].sort((a, b) => a.kind === 'exam' ? -1 : b.kind === 'exam' ? 1 : a.title.localeCompare(b.title));
  const selected = new Date(`${selectedDate}T00:00:00`);

  return <section className="calendar-card"><div className="right-card-heading calendar-heading"><div><span className="dashboard-eyebrow">YOUR SCHEDULE</span><h3>Calendar</h3></div><button className="calendar-add" onClick={onAddEvent} aria-label="Add event on selected date"><Icon name="plus" size={16}/></button></div><div className="calendar-month-nav"><button onClick={() => setMonth(new Date(year, monthIndex - 1, 1))} aria-label="Previous month">‹</button><strong>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}</strong><button onClick={() => setMonth(new Date(year, monthIndex + 1, 1))} aria-label="Next month">›</button></div><div className="calendar-grid" aria-label={new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}>{['M','T','W','T','F','S','S'].map((day, index) => <span className="calendar-weekday" key={`${day}-${index}`}>{day}</span>)}{days.map((day, index) => {
    if (!day) return <span className="calendar-blank" key={`blank-${index}`}/>;
    const date = localDate(new Date(year, monthIndex, day));
    const hasTasks = Boolean(tasksByDate[date]?.length);
    return <button key={date} aria-label={`${selectedDate === date ? 'Selected date, ' : ''}${formatLongDate(new Date(`${date}T00:00:00`))}${hasTasks ? `, ${tasksByDate[date].length} saved item${tasksByDate[date].length === 1 ? '' : 's'}` : ''}`} aria-current={date === todayDate() ? 'date' : undefined} className={`calendar-day ${selectedDate === date ? 'selected' : ''} ${date === todayDate() ? 'today' : ''} ${hasTasks ? 'has-event' : ''}`} onClick={() => setSelectedDate(date)}>{day}{hasTasks && <i/>}</button>;
  })}</div><div className="calendar-agenda"><div className="agenda-date"><span className="dashboard-eyebrow">SELECTED DAY</span><strong>{formatLongDate(selected)}</strong></div>{selectedTasks.length === 0 ? <div className="agenda-empty"><span className="timeline-line"/><p>No saved events for this day.</p></div> : <div className="agenda-list"><span className="timeline-line"/>{selectedTasks.map(task => <div className="agenda-item" key={task.id}><span className={`agenda-dot ${task.kind}`}/><div><strong>{task.title}</strong><small>{taskKindLabel[task.kind]} · {data.subjects.find(subject => subject.id === task.subjectId)?.name || 'Subject'}{task.completed ? ' · complete' : ''}</small></div></div>)}</div>}<button className="agenda-add-link" onClick={onAddEvent}><Icon name="plus" size={14}/> Add event</button></div></section>;
}

export function QuickProfile({ onSettings }: { onSettings: () => void }) {
  return <button className="academic-profile" aria-label="Local workspace profile. No account connected." title="Local workspace profile" onClick={onSettings}><span className="profile-avatar"><Icon name="user" size={18}/></span><span><strong>Local workspace</strong><small>No account connected</small></span><Icon name="chevron" size={15}/></button>;
}

export function EmptySettings({ data, status, modelName, theme, onThemeChange, preferredName, onEditPreferredName }: {
  data: AcademicData;
  status: ProviderStatus;
  modelName: string;
  theme: 'light' | 'dark' | 'system';
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
  preferredName: string;
  onEditPreferredName: () => void;
}) {
  return <section className="academic-page settings-page"><div className="page-intro"><div><span className="dashboard-eyebrow">PREFERENCES</span><h2>Academic settings</h2><p>Personalize the workspace and review its local AI and storage settings.</p></div></div><div className="settings-grid"><article className="dashboard-card settings-item"><span className="settings-icon"><Icon name="user" size={18}/></span><div className="settings-copy"><strong>Preferred name</strong><p>Personalize AURA’s welcome greeting.</p><small>Current name: {preferredName || "Not set"}</small><button className="settings-name-edit" type="button" onClick={onEditPreferredName}>Edit preferred name</button></div></article><article className="dashboard-card settings-item appearance-setting"><span className="settings-icon"><Icon name="bulb" size={18}/></span><div className="settings-copy"><strong>Appearance</strong><p>Choose how the Academic workspace looks.</p><label htmlFor="academic-theme">Theme</label><select id="academic-theme" value={theme} onChange={event => onThemeChange(event.target.value as 'light' | 'dark' | 'system')}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select><small>Your choice is saved in this browser and applies to Academic pages only.</small></div></article><article className="dashboard-card settings-item"><span className="settings-icon"><Icon name="spark" size={18}/></span><div><strong>AI provider</strong><p><span className={`provider-dot ${status}`}/>{status === 'checking' ? 'Checking configured provider…' : status === 'online' ? `${modelName} is available through the configured Ollama endpoint.` : 'Ollama is not responding at the configured endpoint.'}</p><small>Academic requests use the server-side provider configuration. No cloud provider is configured.</small></div></article><article className="dashboard-card settings-item"><span className="settings-icon"><Icon name="database" size={18}/></span><div><strong>Local study data</strong><p>Saved in this browser’s IndexedDB</p><small>{data.subjects.length} subjects · {data.documents.length} materials · {data.tasks.length} planner items. Clearing site data removes these records.</small></div></article></div></section>;
}

export function navGroups(onNavigate: (action: AcademicAction) => void, activeSection: AcademicSection, activePrompt: string, activeFormat: ExamFormat) {
  const items: { label: string; icon: IconName; action: AcademicAction; active?: boolean }[] = [
    { label: 'Home', icon: 'home', action: { section: 'overview' }, active: activeSection === 'overview' },
    { label: 'Ask a Question', icon: 'help', action: { section: 'ask' }, active: activeSection === 'ask' && !activePrompt },
    { label: 'Explain Concept', icon: 'bulb', action: { section: 'ask', prompt: 'Explain this topic from my notes: ' }, active: activeSection === 'ask' && activePrompt.startsWith('Explain') },
    { label: 'Practice Quiz', icon: 'quiz', action: { section: 'exams', format: 'mcq' }, active: activeSection === 'exams' && activeFormat === 'mcq' },
    { label: 'Practice Questions', icon: 'questions', action: { section: 'exams', format: 'short-answer' }, active: activeSection === 'exams' && activeFormat === 'short-answer' },
    { label: 'Learning Path', icon: 'path', action: { section: 'planner' }, active: activeSection === 'planner' },
    { label: 'Exam Planner', icon: 'exam', action: { section: 'exam-planner' }, active: activeSection === 'exam-planner' },
    { label: 'College Notices', icon: 'notes', action: { section: 'notices' }, active: activeSection === 'notices' },
    { label: 'Attendance Tracker', icon: 'calendar', action: { section: 'attendance' }, active: activeSection === 'attendance' },
    { label: 'Flashcards', icon: 'cards', action: { section: 'exams', format: 'flashcards' }, active: activeSection === 'exams' && activeFormat === 'flashcards' },
    { label: 'Summary Notes', icon: 'notes', action: { section: 'ask', prompt: 'Create concise summary notes about: ' } },
    { label: 'PDF Reader', icon: 'pdf', action: { section: 'materials' }, active: activeSection === 'materials' },
    { label: 'Mind Map', icon: 'mind', action: { section: 'ask', prompt: 'Create a text-only mind map of my study material about: ' } },
    { label: 'Lecture Companion', icon: 'lecture', action: { section: 'ask', prompt: 'Explain this lecture material from my notes: ' } },
    { label: 'Research Analysis', icon: 'research', action: { section: 'ask', prompt: 'Analyze the argument and supporting evidence in my notes about: ' } },
    { label: 'Exam Simulator', icon: 'exam', action: { section: 'exams', format: 'mock-paper' }, active: activeSection === 'exams' && activeFormat === 'mock-paper' },
    { label: 'Language Tutor', icon: 'language', action: { section: 'ask', prompt: 'Help me study this language topic using my notes: ' } },
    { label: 'Chat', icon: 'chat', action: { section: 'chat' } },
    { label: 'Settings', icon: 'settings', action: { section: 'settings' }, active: activeSection === 'settings' }
  ];
  return <nav className="dashboard-nav" aria-label="Academic tools">{items.map(item => <button key={item.label} className={`dashboard-nav-item ${item.active ? 'active' : ''}`} aria-current={item.active ? 'page' : undefined} onClick={() => onNavigate(item.action)}><Icon name={item.icon} size={17}/><span>{item.label}</span></button>)}</nav>;
}

