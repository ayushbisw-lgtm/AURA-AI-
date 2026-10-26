import { cloudDataEnabled, deleteCloudRecord, loadCloudRecords, saveCloudRecord } from './supabase/records.ts';

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string };
export type ChatConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatHistoryMessage[];
};

const STORE_NAME = 'conversations';

function openDatabase(userId: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Local browser storage is unavailable.'));
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(userId)) return Promise.reject(new Error('A valid signed-in account is required.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`aura-chat-history-${userId}`, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open chat history.'));
    request.onblocked = () => reject(new Error('Close other AURA tabs to update chat history.'));
  });
}
export async function loadChatHistory(userId: string): Promise<ChatConversation[]> {
  if (cloudDataEnabled()) return (await loadCloudRecords<ChatConversation>(userId, 'chat')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const database = await openDatabase(userId);
  try {
    const records = await new Promise<ChatConversation[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as ChatConversation[]);
      request.onerror = () => reject(request.error ?? new Error('Could not read chat history.'));
    });
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    database.close();
  }
}

export async function migrateLegacyChatHistory(userId: string): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
  const databases = await indexedDB.databases();
  if (!databases.some(database => database.name === 'aura-chat-history')) return;
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('aura-chat-history');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open existing chat history.'));
  });
  let records: ChatConversation[];
  try {
    records = await new Promise<ChatConversation[]>((resolve, reject) => {
      const request = legacy.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as ChatConversation[]);
      request.onerror = () => reject(request.error ?? new Error('Could not read existing chat history.'));
    });
  } finally { legacy.close(); }
  for (const conversation of records) await saveChatConversation(userId, conversation);
}

export async function saveChatConversation(userId: string, conversation: ChatConversation): Promise<void> {
  if (cloudDataEnabled()) return saveCloudRecord(userId, 'chat', conversation.id, conversation);
  const database = await openDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(conversation);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this conversation.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving this conversation was cancelled.'));
    });
  } finally {
    database.close();
  }
}

export async function deleteChatConversation(userId: string, id: string): Promise<void> {
  if (cloudDataEnabled()) return deleteCloudRecord(userId, 'chat', id);
  const database = await openDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete this conversation.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Deleting this conversation was cancelled.'));
    });
  } finally {
    database.close();
  }
}
