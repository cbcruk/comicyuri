/** IndexedDB-backed shelf so opened books survive a page reload. */

export interface StoredBook {
  id: string
  title: string
  source: 'zip' | 'images' | 'folder'
  names: string[]
  blobs: Blob[]
  createdAt: number
  /** Small cover thumbnail generated at import time (optional). */
  cover?: Blob
  pageCount?: number
}

const DB_NAME = 'comicyuri'
const STORE = 'books'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE)
        const req = run(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export async function getAllBooks(): Promise<StoredBook[]> {
  try {
    const all = await tx<StoredBook[]>('readonly', (s) => s.getAll())
    return all.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function putBook(book: StoredBook): Promise<void> {
  await tx('readwrite', (s) => s.put(book))
}

export async function deleteBook(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}
