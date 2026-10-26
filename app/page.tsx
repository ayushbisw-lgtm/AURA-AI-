'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import AcademicWorkspace from './academic/AcademicWorkspace';
import AuthGate from './AuthGate';
import MemoryWorkspace from './MemoryWorkspace';
import CodingWorkspace from './CodingWorkspace';
import TasksWorkspace from './TasksWorkspace';
import StartupScreen from './StartupScreen';
import FormattedResponse from './FormattedResponse';
import WorkspaceSidebar, { type WorkspaceSection } from './WorkspaceSidebar';
import type { PublicUser } from '@/lib/auth';
import { ChatConversation, ChatHistoryMessage, deleteChatConversation, loadChatHistory, saveChatConversation } from '../lib/chat-history-store';
import { findRelevantMemories } from '@/lib/personal-core';
import { loadPersonalData, loadPreferredName, savePreferredName } from '@/lib/personal-store';
import { formatPersonalGreeting, formatStartupGreeting, getGreetingPeriod, getStartupGreetingPeriod, normalizePreferredName, type GreetingPeriod, type StartupGreetingPeriod } from '@/lib/profile';

type Message = { role: 'user' | 'assistant'; content: string };
type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';
type BrowserSpeechAlternative = { transcript: string };
type BrowserSpeechResult = { 0: BrowserSpeechAlternative; isFinal: boolean; length: number };
type BrowserSpeechResultList = { [index: number]: BrowserSpeechResult; length: number };
type BrowserSpeechRecognitionEvent = Event & { results: BrowserSpeechResultList };
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}
const starterPrompts = [
  'Explain a difficult CSE topic simply',
  'Help me plan today’s study session',
  'Review this code and find bugs',
  'Suggest a practical cybersecurity project'
];

export default function Home() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [preferredName, setPreferredName] = useState('');
  const [nameReady, setNameReady] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [greetingPeriod, setGreetingPeriod] = useState<GreetingPeriod | null>(null);
  const [startupGreetingPeriod, setStartupGreetingPeriod] = useState<StartupGreetingPeriod | null>(null);
  const [startupOverlayActive, setStartupOverlayActive] = useState(true);
  const [authState, setAuthState] = useState<'checking' | 'signed-out' | 'signed-in'>('checking');
  const [workspace, setWorkspace] = useState<WorkspaceSection>('assistant');
  const [visitedWorkspaces, setVisitedWorkspaces] = useState<Set<WorkspaceSection>>(() => new Set(['assistant', 'history']));
  const [messages, setMessages] = useState<Message[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [voiceSupported, setVoiceSupported] = useState<boolean | null>(null);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const shouldFollowMessagesRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceStatusRef = useRef<VoiceStatus>('idle');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      setGreetingPeriod(getGreetingPeriod(hour));
      setStartupGreetingPeriod(getStartupGreetingPeriod(hour));
    };
    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function changeVoiceStatus(next: VoiceStatus) {
    voiceStatusRef.current = next;
    setVoiceStatus(next);
  }

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(Boolean(Recognition));
    setSpeechOutputSupported('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetch('/api/auth', { cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!mounted) return;
      if (response.ok && data.user) { setUser(data.user as PublicUser); setAuthState('signed-in'); }
      else setAuthState('signed-out');
    }).catch(() => { if (mounted) setAuthState('signed-out'); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setConversations([]); setHistoryLoaded(false); setHistoryError('');
    void loadChatHistory(user.id).then(items => {
      if (mounted) setConversations(items);
    }).catch(error => {
      if (mounted) setHistoryError(error instanceof Error ? error.message : 'Chat history could not be loaded.');
    }).finally(() => {
      if (mounted) setHistoryLoaded(true);
    });
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setPreferredName('');
      setNameReady(false);
      setNameDialogOpen(false);
      return;
    }
    let active = true;
    const profileName = normalizePreferredName(user.name);
    setNameReady(false);
    void loadPreferredName(user.id).then(savedName => {
      if (!active) return;
      const name = savedName || profileName;
      setPreferredName(name);
      if (!name) {
        setNameDraft('');
        setNameDialogOpen(true);
      }
      setNameReady(true);
    }).catch(() => {
      if (!active) return;
      setPreferredName(profileName);
      if (!profileName) {
        setNameDraft('');
        setNameDialogOpen(true);
      }
      setNameReady(true);
    });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });
        const data = await response.json();
        if (!controller.signal.aborted) setStatus(data.ok ? 'online' : 'offline');
      } catch {
        if (!controller.signal.aborted) setStatus('offline');
      }
    }

    void checkHealth();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (workspace !== 'assistant' || !shouldFollowMessagesRef.current) return;
    const scrollArea = endRef.current?.parentElement;
    if (scrollArea) scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
    shouldFollowMessagesRef.current = false;
  }, [messages, workspace]);

  useEffect(() => {
    if (messages.length === 0) {
      setShowWelcome(true);
      return;
    }
    const timer = window.setTimeout(() => setShowWelcome(false), 190);
    return () => window.clearTimeout(timer);
  }, [messages.length]);

  async function sendMessage(text = input) {
    const content = text.trim();
    if (!content || busy) return;
    const conversationId = activeConversationId ?? crypto.randomUUID();
    const previousConversation = conversations.find(item => item.id === conversationId);
    const next: Message[] = [...messages, { role: 'user', content }];
    const now = new Date().toISOString();
    const titleText = next.find(message => message.role === 'user')?.content ?? 'New conversation';
    const baseRecord: ChatConversation = {
      id: conversationId,
      title: titleText.length > 72 ? `${titleText.slice(0, 69)}…` : titleText,
      createdAt: previousConversation?.createdAt ?? now,
      updatedAt: now,
      messages: next
    };
    setActiveConversationId(conversationId);
    shouldFollowMessagesRef.current = true;
    setMessages(next);
    setInput('');
    setBusy(true);
    setHistoryError('');
    const fromVoice = voiceStatusRef.current === 'processing';
    setConversations(current => [baseRecord, ...current.filter(item => item.id !== conversationId)]);
    try {
      await saveChatConversation(user!.id, baseRecord);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'This conversation could not be saved locally.');
    }
    try {
      let relevantMemories: { id: string; title: string; content: string; category: string }[] = [];
      try {
        const personalData = await loadPersonalData(user!.id);
        if (personalData.memoryEnabled) relevantMemories = findRelevantMemories(`${next.slice(-4).map(message => message.content).join('\n')}`, personalData.memories);
      } catch {
        // Chat remains available if optional local memory storage cannot be read.
      }
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-40), memoryEnabled: relevantMemories.length > 0, memories: relevantMemories })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The request failed.');
      const completed = [...next, { role: 'assistant' as const, content: data.message }];
      shouldFollowMessagesRef.current = true;
      setMessages(completed);
      const record = { ...baseRecord, updatedAt: new Date().toISOString(), messages: completed };
      setConversations(current => [record, ...current.filter(item => item.id !== conversationId)]);
      try { await saveChatConversation(user!.id, record); } catch (error) {
        setHistoryError(error instanceof Error ? error.message : 'This conversation could not be saved locally.');
      }
      if (fromVoice && voiceReplies) speakReply(data.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      const completed = [...next, { role: 'assistant' as const, content: `I couldn’t reach the local AI model. ${message}\n\nCheck that Ollama is installed, running, and has the configured model.` }];
      shouldFollowMessagesRef.current = true;
      setMessages(completed);
      const record = { ...baseRecord, updatedAt: new Date().toISOString(), messages: completed };
      setConversations(current => [record, ...current.filter(item => item.id !== conversationId)]);
      try { await saveChatConversation(user!.id, record); } catch (error) {
        setHistoryError(error instanceof Error ? error.message : 'This conversation could not be saved locally.');
      }
    } finally {
      setBusy(false);
      if (fromVoice && voiceStatusRef.current === 'processing') changeVoiceStatus('idle');
    }
  }

  function startVoiceInput() {
    if (voiceStatusRef.current === 'listening') {
      recognitionRef.current?.stop();
      changeVoiceStatus('idle');
      return;
    }
    if (busy) return;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError('Voice input is not supported by this browser. You can still type in the chat box.');
      return;
    }
    setVoiceError('');
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript.trim();
      if (!transcript) return;
      recognitionRef.current = null;
      changeVoiceStatus('processing');
      setInput(transcript);
      void sendMessage(transcript);
    };
    recognition.onerror = event => {
      recognitionRef.current = null;
      changeVoiceStatus('idle');
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setVoiceError(event.error === 'not-allowed'
          ? 'Microphone access was denied. Allow microphone access in your browser settings to use voice input.'
          : `Voice input failed${event.error ? ` (${event.error})` : ''}. You can try again or type your message.`);
      } else if (event.error === 'no-speech') {
        setVoiceError('No speech was detected. Try again or type your message.');
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (voiceStatusRef.current === 'listening') changeVoiceStatus('idle');
    };
    recognitionRef.current = recognition;
    changeVoiceStatus('listening');
    try { recognition.start(); } catch {
      recognitionRef.current = null;
      changeVoiceStatus('idle');
      setVoiceError('Could not start voice input. Check microphone permission and try again.');
    }
  }

  function speakReply(content: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utteranceRef.current = utterance;
    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        changeVoiceStatus('idle');
      }
    };
    utterance.onerror = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        changeVoiceStatus('idle');
        setVoiceError('AURA could not read this reply aloud.');
      }
    };
    changeVoiceStatus('speaking');
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    if (voiceStatusRef.current === 'speaking') changeVoiceStatus('idle');
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); void sendMessage(); }

  async function removeConversation(id: string) {
    setHistoryError('');
    try {
      await deleteChatConversation(user!.id, id);
      setConversations(current => current.filter(item => item.id !== id));
      if (selectedHistoryId === id) setSelectedHistoryId(null);
      if (activeConversationId === id) { setActiveConversationId(null); setMessages([]); }
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'This conversation could not be deleted.');
    }
  }

  function resumeConversation(conversation: ChatConversation) {
    shouldFollowMessagesRef.current = true;
    setMessages(conversation.messages as ChatHistoryMessage[]);
    setActiveConversationId(conversation.id);
    setWorkspace('assistant');
    setInput('');
  }

  function navigateWorkspace(section: WorkspaceSection) {
    if (section === 'history') { setHistorySearch(''); setSelectedHistoryId(null); }
    setVisitedWorkspaces(current => current.has(section) ? current : new Set(current).add(section));
    setWorkspace(section);
  }

  function newConversation() {
    shouldFollowMessagesRef.current = true;
    setMessages([]); setActiveConversationId(null); setInput(''); setWorkspace('assistant');
  }

  function openNameEditor() {
    setNameDraft(preferredName || normalizePreferredName(user?.name));
    setNameError('');
    setNameDialogOpen(true);
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || nameSaving) return;
    const name = normalizePreferredName(nameDraft);
    if (!name) { setNameError('Enter a preferred name to continue.'); return; }
    setNameSaving(true);
    setNameError('');
    try {
      await savePreferredName(user.id, name);
      setPreferredName(name);
      setNameDialogOpen(false);
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Could not save your preferred name.');
    } finally { setNameSaving(false); }
  }

  async function signOut() {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signout' }) });
    setMessages([]); setConversations([]); setActiveConversationId(null); setSelectedHistoryId(null);
    setPreferredName(''); setNameReady(false); setNameDialogOpen(false);
    setUser(null); setAuthState('signed-out'); setWorkspace('assistant');
  }

  const filteredHistory = conversations.filter(item => `${item.title} ${item.messages.at(-1)?.content ?? ''}`.toLowerCase().includes(historySearch.toLowerCase()));
  const selectedHistory = conversations.find(item => item.id === selectedHistoryId);
  const moduleTitles = { memory: 'Memory', coding: 'Coding tools', tasks: 'Tasks' } as const;
  const signedIn = authState === 'signed-in' && user !== null;
  const startupReady = authState === 'signed-out' || (signedIn && historyLoaded && nameReady);
  const startupStatus = authState === 'checking' ? 'Checking your AURA account…'
    : !signedIn ? 'Workspace ready'
      : !historyLoaded && !nameReady ? 'Restoring conversations and loading your profile…'
        : !historyLoaded ? 'Restoring your conversations…'
          : !nameReady ? 'Loading your saved profile…' : 'Workspace ready';
  const completeStartup = useCallback(() => setStartupOverlayActive(false), []);
  const content = authState === 'checking' ? null
    : !signedIn ? <AuthGate onAuthenticated={account => { setUser(account); setAuthState('signed-in'); }} />
      : <>
    <main className="shell app-shell" hidden={workspace === 'academic'}>
      <WorkspaceSidebar active={workspace} status={status} onNavigate={navigateWorkspace} onNewChat={newConversation}/>
      <section className="main-panel app-main-panel">
        <section className={`workspace-panel chat-panel ${workspace === 'assistant' ? 'is-active' : ''}`} hidden={workspace !== 'assistant'} aria-label="Assistant workspace">
          <header className="topbar"><div><span className="eyebrow">YOUR PRIVATE WORKSPACE</span><h1>Assistant</h1></div><div className="topbar-auth"><button className="profile-name-button" onClick={openNameEditor} aria-label="Edit preferred name">{preferredName || normalizePreferredName(user.name) || 'Your profile'}</button><div className="model-pill"><span className={`tiny-dot ${status}`} /> {status === 'online' ? 'LOCAL MODEL' : 'LOCAL MODE'}</div><button className="signout-button" onClick={() => void signOut()}>Sign out</button></div></header>
          <div className="conversation">
            {showWelcome && <div className={`welcome ${messages.length ? 'welcome-exiting' : ''}`} aria-hidden={messages.length > 0}>
              <div className="orb"><span>✳</span></div>
              <div className="eyebrow">A NEW KIND OF PERSONAL AI</div>
              <p className="welcome-greeting" aria-live="polite">{nameReady && greetingPeriod ? formatPersonalGreeting(greetingPeriod, preferredName) : <span className="greeting-loading">Preparing your welcome…</span>}</p>
              <h2>What’s on your mind?</h2>
              <p className="welcome-subtitle">I’m here to help you figure things out, learn something new, or build something great.</p>
              <div className="prompt-grid">{starterPrompts.map(prompt => <button key={prompt} onClick={() => void sendMessage(prompt)}>{prompt}<span>↗</span></button>)}</div>
            </div>}
            {messages.length > 0 && <div className="messages">{messages.map((message, index) => <article className={`message ${message.role}`} key={`${activeConversationId ?? 'draft'}-${index}`}><div className="avatar">{message.role === 'user' ? 'Y' : 'A'}</div><div className="message-body"><div className="message-name">{message.role === 'user' ? 'You' : 'AURA'}</div>{message.role === 'assistant' ? <FormattedResponse content={message.content}/> : <p>{message.content}</p>}</div></article>)}{busy && messages.at(-1)?.role === 'user' && <article className="message assistant"><div className="avatar">A</div><div className="message-body"><div className="message-name">AURA</div><p className="typing"><span/><span/><span/> Thinking</p></div></article>}<div ref={endRef}/></div>}
          </div>
          {historyError && <div className="history-inline-error" role="status">Chat history: {historyError}</div>}
          <div className="composer-wrap"><form className="composer" onSubmit={onSubmit}><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Ask AURA anything..." rows={1} disabled={busy}/><div className="composer-footer"><span>↵ Send · Shift + ↵ new line</span><button type="submit" disabled={busy || !input.trim()} aria-label="Send message">↑</button></div></form><p className="disclaimer">AI can make mistakes. Verify important information. Local model responses stay on this machine unless you add external services.</p></div>
          <section className="voice-panel" aria-labelledby="voice-panel-title">
            <div className="voice-mic-area">{voiceSupported === null ? <div className="voice-checking" role="status">Checking microphone support…</div> : voiceSupported ? <button className={`voice-mic ${voiceStatus === 'listening' ? 'is-listening' : ''}`} onClick={startVoiceInput} disabled={busy || voiceStatus === 'processing' || voiceStatus === 'speaking'} aria-label={voiceStatus === 'listening' ? 'Stop listening' : 'Start voice input'}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7"/></svg></button> : <div className="voice-unavailable" role="status"><span>◌</span><strong>Voice input unavailable</strong></div>}</div>
            <div className="voice-copy"><span className={`voice-state ${voiceStatus}`}><i/>{voiceStatus === 'listening' ? 'LISTENING' : voiceStatus === 'processing' ? 'PROCESSING' : voiceStatus === 'speaking' ? 'SPEAKING' : 'VOICE INPUT'}</span><h2 id="voice-panel-title">{voiceStatus === 'listening' ? 'Listening…' : voiceStatus === 'processing' ? 'Sending your question' : voiceStatus === 'speaking' ? 'AURA is speaking' : 'Tap to speak'}</h2><p>{voiceSupported === false ? 'Voice input is not supported in this browser. You can still chat by typing above.' : voiceSupported === null ? 'Checking whether this browser supports voice input.' : voiceStatus === 'listening' ? 'Speak clearly. AURA will send your words when you finish.' : voiceStatus === 'processing' ? 'Your recognized words are being sent to AURA.' : voiceStatus === 'speaking' ? 'AURA is reading the reply aloud.' : 'Click the mic and talk to AURA. Your voice will be converted to text and sent to the AI.'}</p>{voiceError && <p className="voice-error" role="alert">{voiceError}</p>}<small className="voice-privacy">Voice recognition is provided by your browser and may use its speech service.</small></div>
            <div className="voice-controls" aria-label="Voice controls"><span className="voice-controls-title">VOICE CONTROLS</span>{speechOutputSupported && <button className={`voice-control-button ${voiceReplies ? 'enabled' : ''}`} onClick={() => { setVoiceReplies(value => !value); if (voiceReplies) stopSpeaking(); }} aria-pressed={voiceReplies}><span aria-hidden="true">{voiceReplies ? '◖' : '◗'}</span><span>{voiceReplies ? 'Read replies on' : 'Read replies off'}</span></button>}{voiceStatus === 'speaking' && <button className="voice-control-button" onClick={stopSpeaking}><span aria-hidden="true">■</span><span>Stop speaking</span></button>}{!speechOutputSupported && <p className="voice-control-note">Reply audio is not supported by this browser.</p>}</div>
          </section>
        </section>

        <section className={`workspace-panel history-panel ${workspace === 'history' ? 'is-active' : ''}`} hidden={workspace !== 'history'} aria-label="Chat history workspace">
          <header className="topbar"><div><span className="eyebrow">YOUR PRIVATE WORKSPACE</span><h1>Chat history</h1></div><div className="topbar-auth"><button className="profile-name-button" onClick={openNameEditor} aria-label="Edit preferred name">{preferredName || normalizePreferredName(user.name) || 'Your profile'}</button><button className="history-new" onClick={newConversation}>＋ New chat</button><button className="signout-button" onClick={() => void signOut()}>Sign out</button></div></header>
          {historyError && <div className="history-alert" role="alert">{historyError}</div>}
          <div className="history-content"><section className="history-list" aria-label="Saved conversations"><label className="history-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search your conversations" value={historySearch} onChange={event => setHistorySearch(event.target.value)} aria-label="Search conversations" /></label>
            {historyLoaded ? filteredHistory.length ? filteredHistory.map(item => <article className={`history-entry ${selectedHistoryId === item.id ? 'selected' : ''}`} key={item.id}><button className="history-entry-main" onClick={() => setSelectedHistoryId(item.id)}><strong>{item.title || 'Conversation'}</strong><span>{item.messages.at(-1)?.content ?? 'No messages yet'}</span><small>{new Date(item.updatedAt).toLocaleString()} · {item.messages.length} messages</small></button><button className="history-delete" onClick={() => void removeConversation(item.id)} aria-label={`Delete ${item.title || 'conversation'}`} title="Delete conversation">×</button></article>) : <div className="history-empty"><div>◷</div><h2>{historySearch ? 'No matches found' : 'No conversations yet'}</h2><p>{historySearch ? 'Try a different search.' : 'Your chats with AURA will be saved here on this device.'}</p>{!historySearch && <button onClick={newConversation}>Start a conversation</button>}</div> : <p className="history-loading">Loading saved conversations…</p>}
          </section><section className="history-detail" aria-label="Conversation preview">{selectedHistory ? <><div className="history-detail-head"><div><span className="eyebrow">CONVERSATION</span><h2>{selectedHistory.title}</h2><p>{new Date(selectedHistory.createdAt).toLocaleString()}</p></div><button onClick={() => resumeConversation(selectedHistory)}>Continue chat <span>↗</span></button></div><div className="history-transcript">{selectedHistory.messages.map((message, index) => <article className={`message ${message.role}`} key={`${selectedHistory.id}-${index}`}><div className="avatar">{message.role === 'user' ? 'Y' : 'A'}</div><div className="message-body"><div className="message-name">{message.role === 'user' ? 'You' : 'AURA'}</div>{message.role === 'assistant' ? <FormattedResponse content={message.content}/> : <p>{message.content}</p>}</div></article>)}</div></> : <div className="history-detail-empty"><span>◈</span><strong>Select a conversation</strong><p>Preview your saved messages here, or continue a chat with AURA.</p></div>}</section></div>
        </section>

        {(['memory', 'coding', 'tasks'] as const).map(section => visitedWorkspaces.has(section) && <section key={section} className={`workspace-panel module-main-panel ${section}-workspace-panel ${workspace === section ? 'is-active' : ''}`} hidden={workspace !== section} aria-label={`${moduleTitles[section]} workspace`}>
          <header className="topbar"><div><span className="eyebrow">YOUR PRIVATE WORKSPACE</span><h1>{moduleTitles[section]}</h1></div><div className="topbar-auth"><button className="profile-name-button" onClick={openNameEditor} aria-label="Edit preferred name">{preferredName || normalizePreferredName(user.name) || 'Your profile'}</button><button className="signout-button" onClick={() => void signOut()}>Sign out</button></div></header>
          <div className="module-scroll">{section === 'memory' ? <MemoryWorkspace userId={user.id}/> : section === 'coding' ? <CodingWorkspace/> : <TasksWorkspace userId={user.id}/>}</div>
        </section>)}
      </section>
    </main>
    {visitedWorkspaces.has('academic') && <AcademicWorkspace isVisible={workspace === 'academic'} onBack={() => navigateWorkspace('assistant')} onNavigateWorkspace={section => navigateWorkspace(section)} userId={user.id} preferredName={preferredName || normalizePreferredName(user.name)} onEditPreferredName={openNameEditor} onSignOut={() => void signOut()} />}
    {nameReady && nameDialogOpen && <div className="name-dialog-backdrop"><section className="name-dialog" role="dialog" aria-modal="true" aria-labelledby="name-dialog-title" aria-describedby="name-dialog-description"><div className="name-dialog-mark" aria-hidden="true">A</div><span className="eyebrow">YOUR AURA PROFILE</span><h2 id="name-dialog-title">{preferredName ? 'Edit your preferred name' : 'What should AURA call you?'}</h2><p id="name-dialog-description">Your name is used to personalize your welcome. It stays in your account’s local settings.</p><form onSubmit={event => void saveName(event)}><label htmlFor="preferred-name">Preferred name</label><input id="preferred-name" autoFocus autoComplete="given-name" maxLength={80} value={nameDraft} onChange={event => setNameDraft(event.target.value)} placeholder="Your name" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'preferred-name-error' : undefined}/>{nameError && <p className="name-dialog-error" id="preferred-name-error" role="alert">{nameError}</p>}<div className="name-dialog-actions"><button type="button" className="name-dialog-secondary" onClick={() => setNameDialogOpen(false)} disabled={nameSaving}>{preferredName ? 'Cancel' : 'Continue without a name'}</button><button type="submit" className="name-dialog-primary" disabled={nameSaving || !nameDraft.trim()}>{nameSaving ? 'Saving…' : 'Save name'}</button></div></form></section></div>}
  </>;
  return <><div className="application-surface" inert={startupOverlayActive} aria-hidden={startupOverlayActive}>{content}</div><StartupScreen ready={startupReady} greeting={formatStartupGreeting(startupGreetingPeriod, nameReady ? preferredName : '')} status={startupStatus} onComplete={completeStartup}/></>;
}
