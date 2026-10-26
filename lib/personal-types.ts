export type MemoryCategory = 'preferences' | 'projects' | 'study' | 'general';
export type SavedMemory = {
  id: string;
  title: string;
  content: string;
  category: MemoryCategory;
  createdAt: string;
  updatedAt: string;
};

export type PersonalTaskPriority = 'low' | 'medium' | 'high';
export type PersonalTask = {
  id: string;
  title: string;
  description: string;
  dueDate?: string;
  priority: PersonalTaskPriority;
  status: 'pending' | 'completed';
  category: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonalData = { memories: SavedMemory[]; tasks: PersonalTask[]; memoryEnabled: boolean };
