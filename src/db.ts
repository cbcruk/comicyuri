/** IndexedDB-backed shelf so opened books survive a page reload. */

import { Effect } from 'effect'
import { DbError } from './errors.ts'
import type { BookSource } from './types.ts'

/**
 * One book as it sits in IndexedDB: the imported bytes plus what the shelf
 * needs to draw a card without opening them.
 */
export interface StoredBook {
  /** Stable across imports of the same file, so progress finds its book again. */
  id: string
  /** The file or folder name with its extension taken off. */
  title: string
  /** Which of the three import shapes produced this record. */
  source: BookSource
  /** Entry names in reading order, index-aligned with {@linkcode StoredBook.blobs}. */
  names: string[]
  /** The archive as a single blob, or one blob per loose image. */
  blobs: Blob[]
  /** Import time in epoch milliseconds; the shelf lists newest first. */
  createdAt: number
  /** Small cover thumbnail generated at import time (optional). */
  cover?: Blob
  /** Known only once the archive has been opened, so absent on a fresh import. */
  pageCount?: number
}

const DB_NAME = 'comicyuri'
const STORE = 'books'
const VERSION = 1

/**
 * `indexedDB` is absent in some embeddings and `open` itself throws in
 * private-browsing modes, so the call is guarded: without this the failure is
 * a defect that takes the whole program down instead of a `DbError` the shelf
 * can report.
 */
const openDb = Effect.callback<IDBDatabase, DbError>((resume) => {
  try {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resume(Effect.succeed(req.result))
    req.onerror = () => resume(Effect.fail(new DbError({ op: 'open', cause: req.error })))
    req.onblocked = () => resume(Effect.fail(new DbError({ op: 'open', cause: 'blocked' })))
  } catch (cause) {
    resume(Effect.fail(new DbError({ op: 'open', cause })))
  }
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

/**
 * Every stored book, newest import first.
 *
 * That order is the shelf's order, applied here rather than in the view so a
 * reload cannot rearrange the grid.
 */
export const getAllBooks: Effect.Effect<StoredBook[], DbError> = request<StoredBook[]>(
  'getAll',
  'readonly',
  (s) => s.getAll(),
).pipe(Effect.map((books) => books.sort((a, b) => b.createdAt - a.createdAt)))

/** Writes a book, replacing any record already under its id. */
export const putBook = (book: StoredBook): Effect.Effect<void, DbError> =>
  request('put', 'readwrite', (s) => s.put(book)).pipe(Effect.asVoid)

/** Removes a book. Deleting an id that is not there is not an error. */
export const deleteBook = (id: string): Effect.Effect<void, DbError> =>
  request('delete', 'readwrite', (s) => s.delete(id)).pipe(Effect.asVoid)
