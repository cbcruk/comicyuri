/** IndexedDB-backed shelf so opened books survive a page reload. */

import { Effect } from 'effect'
import { DbError } from './errors.ts'
import type { BookSource } from './types.ts'

export interface StoredBook {
  id: string
  title: string
  source: BookSource
  names: string[]
  blobs: Blob[]
  createdAt: number
  /** Small cover thumbnail generated at import time (optional). */
  cover?: Blob
  pageCount?: number
}

const DB_NAME = 'comicyuri'
const STORE = 'books'
const VERSION = 1

const openDb = Effect.callback<IDBDatabase, DbError>((resume) => {
  const req = indexedDB.open(DB_NAME, VERSION)
  req.onupgradeneeded = () => {
    const db = req.result
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE, { keyPath: 'id' })
    }
  }
  req.onsuccess = () => resume(Effect.succeed(req.result))
  req.onerror = () => resume(Effect.fail(new DbError({ op: 'open', cause: req.error })))
})

/** A connection tied to a scope, so it is closed however the effect ends. */
const connection = Effect.acquireRelease(openDb, (db) => Effect.sync(() => db.close()))

const request = <A>(
  op: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<A>,
): Effect.Effect<A, DbError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const db = yield* connection
      return yield* Effect.callback<A, DbError>((resume) => {
        try {
          const req = run(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resume(Effect.succeed(req.result))
          req.onerror = () => resume(Effect.fail(new DbError({ op, cause: req.error })))
        } catch (cause) {
          resume(Effect.fail(new DbError({ op, cause })))
        }
      })
    }),
  )

export const getAllBooks: Effect.Effect<StoredBook[], DbError> = request<StoredBook[]>(
  'getAll',
  'readonly',
  (s) => s.getAll(),
).pipe(Effect.map((books) => books.sort((a, b) => b.createdAt - a.createdAt)))

export const putBook = (book: StoredBook): Effect.Effect<void, DbError> =>
  request('put', 'readwrite', (s) => s.put(book)).pipe(Effect.asVoid)

export const deleteBook = (id: string): Effect.Effect<void, DbError> =>
  request('delete', 'readwrite', (s) => s.delete(id)).pipe(Effect.asVoid)
