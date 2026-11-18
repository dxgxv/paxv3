export interface OfflineOutboxItem {
  id: string;
  url: string;
  method: "POST";
  body: Record<string, unknown>;
  label: string;
  createdAt: number;
  lastError?: string;
}

const DB_NAME = "rental_valdivia_offline_db";
const DB_VERSION = 1;
const STORE_CACHE = "cache";
const STORE_OUTBOX = "outbox";

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyOutbox() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Error abriendo IndexedDB"));
  });
}

export async function saveCachedState<T>(state: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, "readwrite");
      tx.objectStore(STORE_CACHE).put({
        key: "last_state",
        data: state,
        savedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fallback silencioso a localStorage liviano si IndexedDB falla
  }
}

export async function loadCachedState<T>(): Promise<{
  data: T;
  savedAt: number;
} | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, "readonly");
      const req = tx.objectStore(STORE_CACHE).get("last_state");
      req.onsuccess = () => {
        const res = req.result as
          | { key: string; data: T; savedAt: number }
          | undefined;
        resolve(res ? { data: res.data, savedAt: res.savedAt } : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function enqueueOutbox(
  item: Omit<OfflineOutboxItem, "createdAt">
): Promise<OfflineOutboxItem> {
  const fullItem: OfflineOutboxItem = {
    ...item,
    createdAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, "readwrite");
    tx.objectStore(STORE_OUTBOX).put(fullItem);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyOutbox();
  return fullItem;
}

export async function listOutbox(): Promise<OfflineOutboxItem[]> {
  try {
    const db = await openDb();
    const items = await new Promise<OfflineOutboxItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_OUTBOX, "readonly");
      const req = tx.objectStore(STORE_OUTBOX).getAll();
      req.onsuccess = () => resolve((req.result as OfflineOutboxItem[]) || []);
      req.onerror = () => reject(req.error);
    });
    return items.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function removeOutboxItem(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, "readwrite");
    tx.objectStore(STORE_OUTBOX).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyOutbox();
}

export async function updateOutboxError(
  id: string,
  lastError: string
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, "readwrite");
    const store = tx.objectStore(STORE_OUTBOX);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as OfflineOutboxItem | undefined;
      if (existing) {
        store.put({ ...existing, lastError });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyOutbox();
}
