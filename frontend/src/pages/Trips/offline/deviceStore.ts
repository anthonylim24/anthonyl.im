// Somewhere on this device to keep trips between visits: IndexedDB when the
// browser offers it, nothing at all when it doesn't. Private windows can
// refuse or throw at any step, so every call settles (a read to null, a
// write to nothing) and the app works the same without it, just forgetting
// more. Tests use `memoryStore()`.

export interface DeviceStore {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  /** Every key kept. */
  keys(): Promise<string[]>
  /** Forget everything (another account). */
  clear(): Promise<void>
}

/** Keeps nothing: reads find nothing, writes vanish. */
export const noStore: DeviceStore = {
  get: async () => null,
  set: async () => undefined,
  delete: async () => undefined,
  keys: async () => [],
  clear: async () => undefined,
}

/** A store in memory, for tests. Values are cloned, as IndexedDB would. */
export function memoryStore(): DeviceStore & { size: () => number } {
  const map = new Map<string, unknown>()
  return {
    get: async <T>(key: string) => (map.has(key) ? (structuredClone(map.get(key)) as T) : null),
    set: async (key, value) => void map.set(key, structuredClone(value)),
    delete: async (key) => void map.delete(key),
    keys: async () => [...map.keys()],
    clear: async () => map.clear(),
    size: () => map.size,
  }
}

const DB_NAME = "trips-device"
const STORE = "kv"
/** An open that hasn't answered by now never will (a wedged profile, a stuck upgrade): carry on without it. */
const OPEN_DEADLINE_MS = 2_000

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), OPEN_DEADLINE_MS)
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null) // private mode in some browsers: no IndexedDB for this page
    }
  })
}

/** IndexedDB, one object store of keys and values. */
export function indexedDbStore(): DeviceStore {
  let db: Promise<IDBDatabase | null> | null = null
  const run = <T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest | null, fallback: T): Promise<T> => {
    db ??= openDb()
    return db.then(
      (database) =>
        new Promise<T>((resolve) => {
          if (!database) return resolve(fallback)
          try {
            const tx = database.transaction(STORE, mode)
            const request = op(tx.objectStore(STORE))
            tx.oncomplete = () => resolve(request ? ((request.result as T | undefined) ?? fallback) : fallback)
            tx.onerror = () => resolve(fallback)
            tx.onabort = () => resolve(fallback)
          } catch {
            resolve(fallback) // the database closed under us, or the quota is gone
          }
        }),
    )
  }
  return {
    get: <T>(key: string) => run<T | null>("readonly", (s) => s.get(key), null),
    set: (key, value) => run("readwrite", (s) => s.put(value, key), undefined).then(() => undefined),
    delete: (key) => run("readwrite", (s) => s.delete(key), undefined).then(() => undefined),
    keys: () => run<IDBValidKey[]>("readonly", (s) => s.getAllKeys(), []).then((keys) => keys.filter((key): key is string => typeof key === "string")),
    clear: () => run("readwrite", (s) => s.clear(), undefined).then(() => undefined),
  }
}

let shared: DeviceStore | null = null

/** The store for this page: IndexedDB when there is one, else `noStore`. */
export function deviceStore(): DeviceStore {
  shared ??= typeof indexedDB === "undefined" ? noStore : indexedDbStore()
  return shared
}
