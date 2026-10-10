(function (root) {
  const DB_NAME = 'tsukeru';
  const DB_VERSION = 1;
  const STORE_NAME = 'app-state';
  const CURRENT_KEY = 'current';

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('端末内保存に失敗しました'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('端末内保存に失敗しました'));
      transaction.onabort = () => reject(transaction.error || new Error('端末内保存が中断されました'));
    });
  }

  async function openTsukeruDb(indexedDBImpl = root.indexedDB) {
    if (!indexedDBImpl || typeof indexedDBImpl.open !== 'function') throw new Error('このブラウザは端末内保存に対応していません');
    const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    return requestResult(request);
  }

  async function readCurrentState(db) {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const result = await requestResult(transaction.objectStore(STORE_NAME).get(CURRENT_KEY));
    await transactionDone(transaction);
    return result || null;
  }

  async function writeCurrentState(db, state) {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(structuredClone(state), CURRENT_KEY);
    await transactionDone(transaction);
  }

  function createSaveQueue({ write, onStatus = () => {}, delayMs = 250 }) {
    let pending = null;
    let dirty = false;
    let timer = null;
    let drainPromise = null;

    async function drain() {
      while (pending !== null) {
        const snapshot = pending;
        pending = null;
        onStatus('saving');
        try {
          await write(snapshot);
        } catch (error) {
          if (pending === null) pending = snapshot;
          dirty = true;
          onStatus('error', error);
          throw error;
        }
      }
      dirty = false;
      onStatus('saved');
    }

    function flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (!drainPromise) drainPromise = drain().finally(() => { drainPromise = null; });
      return drainPromise;
    }

    function schedule(state) {
      pending = structuredClone(state);
      dirty = true;
      onStatus('dirty');
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, Math.max(0, delayMs));
    }

    return { schedule, flush, retry: flush, isDirty: () => dirty, getPending: () => pending };
  }

  async function requestPersistentStorage(storageManager = root.navigator && root.navigator.storage) {
    if (!storageManager || typeof storageManager.persist !== 'function') return false;
    try { return Boolean(await storageManager.persist()); } catch { return false; }
  }

  root.TSUKERUStorage = Object.freeze({
    DB_NAME, DB_VERSION, STORE_NAME, CURRENT_KEY,
    openTsukeruDb, readCurrentState, writeCurrentState, createSaveQueue, requestPersistentStorage
  });
})(globalThis);
