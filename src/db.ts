/** IndexedDB에 얹은 책장. 한 번 연 책이 새로고침을 넘겨 살아남는다. */

import { Effect } from 'effect'
import { DbError } from './errors.ts'
import type { BookSource } from './types.ts'

/**
 * IndexedDB에 놓인 그대로의 책 한 권. 들여온 바이트와, 그것을 열어 보지 않고도
 * 책장이 카드를 그리는 데 필요한 것들.
 */
export interface StoredBook {
  /** 같은 파일을 다시 들여와도 같다. 그래야 진행 상태가 제 책을 찾는다. */
  id: string
  /** 확장자를 뗀 파일 또는 폴더 이름. */
  title: string
  /** 세 가지 임포트 방식 중 어느 것이 이 레코드를 만들었는지. */
  source: BookSource
  /** 읽는 순서대로의 이름들. {@linkcode StoredBook.blobs}와 번호가 맞물린다. */
  names: string[]
  /** 아카이브 하나를 담은 blob, 또는 낱장 이미지마다 하나씩. */
  blobs: Blob[]
  /** 들여온 시각(epoch 밀리초). 책장은 최신 것부터 늘어놓는다. */
  createdAt: number
  /** 들여올 때 만들어 둔 작은 표지 썸네일(없을 수 있다). */
  cover?: Blob
  /** 아카이브를 열어 봐야 알 수 있으므로, 갓 들여온 레코드에는 없다. */
  pageCount?: number
}

const DB_NAME = 'comicyuri'
const STORE = 'books'
const VERSION = 1

/**
 * 어떤 환경에는 `indexedDB` 자체가 없고, 시크릿 모드에서는 `open`이 곧바로
 * 던진다. 그래서 호출을 감싼다. 감싸지 않으면 이 실패는 책장이 알릴 수 있는
 * `DbError`가 아니라 프로그램 전체를 무너뜨리는 결함이 된다.
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

/** 스코프에 묶인 연결. Effect가 어떻게 끝나든 닫힌다. */
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
 * 저장된 모든 책. 최근에 들여온 것이 앞에 온다.
 *
 * 이 순서가 곧 책장의 순서다. 뷰가 아니라 여기서 정하므로 새로고침이 격자를
 * 다시 배열하는 일은 없다.
 */
export const getAllBooks: Effect.Effect<StoredBook[], DbError> = request<StoredBook[]>(
  'getAll',
  'readonly',
  (s) => s.getAll(),
).pipe(Effect.map((books) => books.sort((a, b) => b.createdAt - a.createdAt)))

/** 책을 쓴다. 같은 id의 레코드가 있으면 덮어쓴다. */
export const putBook = (book: StoredBook): Effect.Effect<void, DbError> =>
  request('put', 'readwrite', (s) => s.put(book)).pipe(Effect.asVoid)

/** 책을 지운다. 없는 id를 지우는 것은 실패가 아니다. */
export const deleteBook = (id: string): Effect.Effect<void, DbError> =>
  request('delete', 'readwrite', (s) => s.delete(id)).pipe(Effect.asVoid)
