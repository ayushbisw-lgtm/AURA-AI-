import type { AcademicData, AcademicTask, Semester, StudyDocument, Subject } from './academic-types';
import { EMPTY_ACADEMIC_DATA } from './academic-types';

let activeUserId = '';
export function setAcademicUser(userId: string) { activeUserId = userId; }
const DATABASE_NAME = 'aura-academic';
const DATABASE_VERSION = 1;
const STORE_NAMES = ['semesters', 'subjects', 'documents', 'tasks'] as const;
type StoreName = typeof STORE_NAMES[number];
type AcademicRecord = Semester | Subject | StudyDocument | AcademicTask;

function openAcademicDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Local browser storage is unavailable.'));
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(activeUserId)) return Promise.reject(new Error('A valid signed-in account is required.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`${DATABASE_NAME}-${activeUserId}`, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of STORE_NAMES) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local academic storage.'));
    request.onblocked = () => reject(new Error('Close other AURA tabs to update local academic storage.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not access local academic storage.'));
  });
}

async function getAll<T extends AcademicRecord>(store: StoreName): Promise<T[]> {
  const database = await openAcademicDatabase();
  try {
    const transaction = database.transaction(store, 'readonly');
    return await requestResult(transaction.objectStore(store).getAll()) as T[];
  } finally {
    database.close();
  }
}

export async function loadAcademicData(): Promise<AcademicData> {
  const [semesters, subjects, documents, tasks] = await Promise.all([
    getAll<Semester>('semesters'), getAll<Subject>('subjects'),
    getAll<StudyDocument>('documents'), getAll<AcademicTask>('tasks')
  ]);
  return { semesters, subjects, documents, tasks };
}

export async function migrateLegacyAcademicData(userId: string): Promise<void> {
  setAcademicUser(userId);
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
  const databases = await indexedDB.databases();
  if (!databases.some(database => database.name === DATABASE_NAME)) return;
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open existing Academic data.'));
  });
  let data: AcademicData;
  try {
    const transaction = legacy.transaction([...STORE_NAMES], 'readonly');
    const results = await Promise.all(STORE_NAMES.map(store => requestResult(transaction.objectStore(store).getAll())));
    data = { semesters: results[0] as Semester[], subjects: results[1] as Subject[], documents: results[2] as StudyDocument[], tasks: results[3] as AcademicTask[] };
  } finally { legacy.close(); }
  for (const semester of data.semesters) await saveAcademicRecord('semesters', semester);
  for (const subject of data.subjects) await saveAcademicRecord('subjects', subject);
  for (const document of data.documents) await saveAcademicRecord('documents', document);
  for (const task of data.tasks) await saveAcademicRecord('tasks', task);
}

export async function saveAcademicRecord(store: StoreName, record: AcademicRecord): Promise<void> {
  const database = await openAcademicDatabase();
  try {
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this item.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving this item was cancelled.'));
    });
  } finally {
    database.close();
  }
}

export async function deleteAcademicRecord(store: StoreName, id: string): Promise<void> {
  const database = await openAcademicDatabase();
  try {
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete this item.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Deleting this item was cancelled.'));
    });
  } finally {
    database.close();
  }
}

export { EMPTY_ACADEMIC_DATA };
