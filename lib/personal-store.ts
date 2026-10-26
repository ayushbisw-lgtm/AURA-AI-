import type { MemoryCategory, PersonalData, PersonalTask, SavedMemory } from './personal-types';
import { clearCloudCollection, cloudDataEnabled, deleteCloudRecord, loadCloudRecords, saveCloudRecord } from './supabase/records.ts';

const DATABASE_VERSION = 1;
const STORES = ['memories', 'tasks', 'settings'] as const;
type DataStore = 'memories' | 'tasks';

function openPersonalDatabase(userId: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Local browser storage is unavailable.'));
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(userId)) return Promise.reject(new Error('A valid signed-in account is required.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`aura-personal-${userId}`, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      for (const store of STORES) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: store === 'settings' ? 'key' : 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open personal workspace storage.'));
    request.onblocked = () => reject(new Error('Close other AURA tabs to update personal workspace storage.'));
  });
}

function getAll<T>(database: IDBDatabase, store: DataStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('Could not load saved items.'));
  });
}

function write<T>(database: IDBDatabase, store: DataStore, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this item.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving this item was cancelled.'));
  });
}

async function remove(database: IDBDatabase, store: DataStore, id: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete this item.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Deleting this item was cancelled.'));
  });
}

export async function loadPersonalData(userId: string): Promise<PersonalData> {
  if (cloudDataEnabled()) {
    const [memories, tasks, settings] = await Promise.all([
      loadCloudRecords<SavedMemory>(userId, 'memories'), loadCloudRecords<PersonalTask>(userId, 'personalTasks'),
      loadCloudRecords<{ key: string; value: unknown }>(userId, 'settings')
    ]);
    const memoryEnabled = settings.find(setting => setting.key === 'memoryEnabled')?.value === true;
    return { memories: memories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), tasks: tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), memoryEnabled };
  }
  const database = await openPersonalDatabase(userId);
  try {
    const [memories, tasks, setting] = await Promise.all([
      getAll<SavedMemory>(database, 'memories'), getAll<PersonalTask>(database, 'tasks'),
      new Promise<{ key: string; value: boolean } | undefined>((resolve, reject) => {
        const request = database.transaction('settings', 'readonly').objectStore('settings').get('memoryEnabled');
        request.onsuccess = () => resolve(request.result as { key: string; value: boolean } | undefined);
        request.onerror = () => reject(request.error ?? new Error('Could not load memory settings.'));
      })
    ]);
    return { memories: memories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), tasks: tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), memoryEnabled: setting?.value === true };
  } finally { database.close(); }
}

export async function saveMemory(userId: string, memory: SavedMemory): Promise<void> {
  if (cloudDataEnabled()) return saveCloudRecord(userId, 'memories', memory.id, memory);
  const database = await openPersonalDatabase(userId);
  try { await write(database, 'memories', memory); } finally { database.close(); }
}

export async function deleteMemory(userId: string, id: string): Promise<void> {
  if (cloudDataEnabled()) return deleteCloudRecord(userId, 'memories', id);
  const database = await openPersonalDatabase(userId);
  try { await remove(database, 'memories', id); } finally { database.close(); }
}

export async function clearMemories(userId: string): Promise<void> {
  if (cloudDataEnabled()) return clearCloudCollection(userId, 'memories');
  const database = await openPersonalDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('memories', 'readwrite');
      transaction.objectStore('memories').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear memories.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Clearing memories was cancelled.'));
    });
  } finally { database.close(); }
}

export async function setMemoryEnabled(userId: string, enabled: boolean): Promise<void> {
  if (cloudDataEnabled()) return saveCloudRecord(userId, 'settings', 'memoryEnabled', { key: 'memoryEnabled', value: enabled });
  const database = await openPersonalDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put({ key: 'memoryEnabled', value: enabled });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this setting.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving this setting was cancelled.'));
    });
  } finally { database.close(); }
}

export async function loadPreferredName(userId: string): Promise<string | null> {
  if (cloudDataEnabled()) {
    const settings = await loadCloudRecords<{ key: string; value?: unknown }>(userId, 'settings');
    const value = settings.find(setting => setting.key === 'preferredName')?.value;
    return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ').slice(0, 80) : null;
  }
  const database = await openPersonalDatabase(userId);
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const request = database.transaction('settings', 'readonly').objectStore('settings').get('preferredName');
      request.onsuccess = () => {
        const value = (request.result as { value?: unknown } | undefined)?.value;
        resolve(typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ').slice(0, 80) : null);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not load your preferred name.'));
    });
  } finally { database.close(); }
}

export async function savePreferredName(userId: string, name: string): Promise<void> {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 80) throw new Error('Enter a name between 1 and 80 characters.');
  if (cloudDataEnabled()) return saveCloudRecord(userId, 'settings', 'preferredName', { key: 'preferredName', value: normalized });
  const database = await openPersonalDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put({ key: 'preferredName', value: normalized });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save your preferred name.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving your preferred name was cancelled.'));
    });
  } finally { database.close(); }
}

export async function savePersonalTask(userId: string, task: PersonalTask): Promise<void> {
  if (cloudDataEnabled()) return saveCloudRecord(userId, 'personalTasks', task.id, task);
  const database = await openPersonalDatabase(userId);
  try { await write(database, 'tasks', task); } finally { database.close(); }
}

export async function deletePersonalTask(userId: string, id: string): Promise<void> {
  if (cloudDataEnabled()) return deleteCloudRecord(userId, 'personalTasks', id);
  const database = await openPersonalDatabase(userId);
  try { await remove(database, 'tasks', id); } finally { database.close(); }
}

export type { MemoryCategory };
