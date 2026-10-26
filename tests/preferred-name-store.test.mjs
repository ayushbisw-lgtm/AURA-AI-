import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPreferredName, savePreferredName } from '../lib/personal-store.ts';

function installMemoryIndexedDB() {
  const databases = new Map();
  globalThis.indexedDB = {
    open(name) {
      const request = {};
      queueMicrotask(() => {
        let database = databases.get(name);
        const fresh = !database;
        if (fresh) {
          const stores = new Map();
          database = {
            objectStoreNames: { contains: storeName => stores.has(storeName) },
            createObjectStore(storeName) { stores.set(storeName, new Map()); },
            transaction(storeName) {
              const records = stores.get(storeName);
              const transaction = {
                objectStore() {
                  return {
                    get(key) {
                      const result = {};
                      queueMicrotask(() => { result.result = records.get(key); result.onsuccess?.(); });
                      return result;
                    },
                    put(record) { records.set(record.key ?? record.id, record); }
                  };
                },
                abort() {}
              };
              queueMicrotask(() => transaction.oncomplete?.());
              return transaction;
            },
            close() {}
          };
          databases.set(name, database);
        }
        request.result = database;
        if (fresh) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}

test('preferred names persist in each account-specific local settings database', async () => {
  installMemoryIndexedDB();
  assert.equal(await loadPreferredName('user-a'), null);
  await savePreferredName('user-a', '  Mira   Rao  ');
  assert.equal(await loadPreferredName('user-a'), 'Mira Rao');
  assert.equal(await loadPreferredName('user-b'), null);
  await assert.rejects(savePreferredName('user-a', '   '), /between 1 and 80/i);
});
