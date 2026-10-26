import type { MemoryCategory, PersonalTask, SavedMemory } from './personal-types';

const MEMORY_CATEGORIES: MemoryCategory[] = ['preferences', 'projects', 'study', 'general'];
const SECRET_PATTERNS = [
  /\b(?:password|passphrase|pin)\s*(?:is|:|=)\s*\S+/i,
  /\b(?:api[ _-]?key|access[ _-]?token|secret|private[ _-]?key)\s*(?:is|:|=)\s*\S+/i,
  /\bsk-[a-z0-9_-]{12,}\b/i,
  /\bgh[pousr]_[a-z0-9]{20,}\b/i,
  /\bbearer\s+[a-z0-9._~+/-]{16,}/i
];
const STOP_WORDS = new Set(['about', 'after', 'also', 'and', 'are', 'because', 'been', 'but', 'can', 'could', 'does', 'for', 'from', 'have', 'into', 'just', 'more', 'most', 'not', 'only', 'our', 'please', 'should', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'this', 'those', 'through', 'under', 'very', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'you', 'your']);

export function validateMemory(title: string, content: string, category: string): string | null {
  if (title.trim().length < 1 || title.trim().length > 120) return 'Title must be between 1 and 120 characters.';
  if (content.trim().length < 1 || content.trim().length > 1200) return 'Memory must be between 1 and 1,200 characters.';
  if (!MEMORY_CATEGORIES.includes(category as MemoryCategory)) return 'Choose a valid memory category.';
  if (SECRET_PATTERNS.some(pattern => pattern.test(`${title}\n${content}`))) return 'This looks like a password, key, or secret. AURA will not save it as a memory.';
  return null;
}

function terms(text: string) {
  return [...new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter(term => !STOP_WORDS.has(term));
}

export function findRelevantMemories(query: string, memories: SavedMemory[], limit = 4): SavedMemory[] {
  const queryTerms = terms(query);
  if (!queryTerms.length || limit < 1) return [];
  return memories.map(memory => {
    const searchable = `${memory.title} ${memory.content} ${memory.category}`.toLocaleLowerCase();
    const score = queryTerms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
    return { memory, score };
  }).filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt))
    .slice(0, Math.min(limit, 4)).map(result => result.memory);
}

export function validateTask(title: string, description: string, dueDate: string, priority: string, category: string): string | null {
  if (title.trim().length < 1 || title.trim().length > 160) return 'Title is required and must be 160 characters or fewer.';
  if (description.length > 2000) return 'Description must be 2,000 characters or fewer.';
  if (dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 'Choose a valid due date.';
    const [year, month, day] = dueDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return 'Choose a valid due date.';
  }
  if (!['low', 'medium', 'high'].includes(priority)) return 'Choose a valid priority.';
  if (category.length > 80) return 'Category must be 80 characters or fewer.';
  return null;
}

export type TaskFilter = 'all' | 'today' | 'upcoming' | 'completed' | 'overdue';
export type TaskSort = 'due' | 'recent' | 'priority';

export function filterAndSortTasks(tasks: PersonalTask[], filter: TaskFilter, search: string, sort: TaskSort, today: string): PersonalTask[] {
  const query = search.trim().toLocaleLowerCase();
  const priorityRank = { high: 0, medium: 1, low: 2 };
  return tasks.filter(task => {
    const matchesSearch = !query || `${task.title} ${task.description} ${task.category}`.toLocaleLowerCase().includes(query);
    if (!matchesSearch) return false;
    if (filter === 'completed') return task.status === 'completed';
    if (task.status === 'completed') return filter === 'all';
    if (filter === 'today') return task.dueDate === today;
    if (filter === 'upcoming') return Boolean(task.dueDate && task.dueDate > today);
    if (filter === 'overdue') return Boolean(task.dueDate && task.dueDate < today);
    return true;
  }).sort((a, b) => {
    if (sort === 'recent') return b.updatedAt.localeCompare(a.updatedAt);
    if (sort === 'priority') return priorityRank[a.priority] - priorityRank[b.priority] || (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
