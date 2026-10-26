'use client';

export type WorkspaceSection = 'assistant' | 'history' | 'academic' | 'memory' | 'coding' | 'tasks';
const items: { id: WorkspaceSection; label: string; icon: string }[] = [
  { id: 'assistant', label: 'Assistant', icon: '◈' }, { id: 'history', label: 'History', icon: '◷' },
  { id: 'academic', label: 'Academic', icon: '✳' }, { id: 'memory', label: 'Memory', icon: '▤' },
  { id: 'coding', label: 'Coding tools', icon: '⌘' }, { id: 'tasks', label: 'Tasks', icon: '✓' }
];

export default function WorkspaceSidebar({ active, status, onNavigate, onNewChat }: {
  active: WorkspaceSection;
  status: 'checking' | 'online' | 'offline';
  onNavigate: (section: WorkspaceSection) => void;
  onNewChat: () => void;
}) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">A</div><div><strong>AURA</strong><span>PERSONAL AI</span></div></div>
    <button className="new-chat" onClick={onNewChat}>＋ <span>New conversation</span></button>
    <div className="side-label">YOUR WORKSPACE</div>
    <nav className="workspace-nav" aria-label="Main navigation">{items.map(item => <button className={`side-item ${active === item.id ? 'active' : ''}`} aria-current={active === item.id ? 'page' : undefined} key={item.id} onClick={() => onNavigate(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
    <div className="sidebar-bottom"><div className={`status-dot ${status === 'offline' ? '' : status}`} /><div><strong>{status === 'online' ? 'Local model ready' : status === 'checking' ? 'Checking local model…' : 'Model not detected'}</strong><span>{status === 'online' ? 'Ollama connection available' : 'Ollama · localhost:11434'}</span></div></div>
  </aside>;
}
