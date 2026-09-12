/**
 * `src/db.ts`를 직접 겨냥한다. happy-dom에는 `indexedDB`가 없으므로, 이 계층이
 * 실제로 지는 위험만 재현할 만큼의 가짜를 세워 둔다.
 *
 * 가짜가 대신하는 것은 저장소이고, 재는 것은 저장소가 아니다 — 어느 스토어를
 * 어느 모드로 열었는지, 실패를 어느 `op`로 옮겨 적는지, 끝나고 연결을 닫는지,
 * 그리고 책장의 순서를 누가 정하는지다.
 */

import { Effect, Option } from 'effect'
import { afterEach, describe, expect, test } from 'vite-plus/test'

import { deleteBook, getAllBooks, putBook } from './db.ts'
import type { StoredBook } from './db.ts'
import { DbError } from './errors.ts'

/** 가짜 저장소가 받은 요청 한 건. */
type Call = Readonly<{ op: string; mode: string }>

/** 가짜가 남긴 자취. 테스트가 이것을 읽는다. */
type Trace = {
  calls: Call[]
  closed: number
  rows: StoredBook[]
}

const book = (id: string, createdAt: number): StoredBook => ({
  id,
  title: id,
  source: 'zip',
  names: [`${id}.cbz`],
  blobs: [new Blob([id])],
  createdAt,
})

/** 다음 태스크에 콜백을 부른다. db.ts는 `open()`이 돌아온 뒤에 그것을 건다. */
const soon = (run: () => void): void => {
  setTimeout(run, 0)
}

/**
 * 가짜 `indexedDB`를 세우고, 그것이 남긴 자취를 돌려준다.
 *
 * @param rows 저장소가 이미 쥐고 있는 책들.
 * @param fails 이 `op`에서 요청이 실패한다. 없으면 모두 성공한다.
 */
const fakeStore = (rows: StoredBook[] = [], fails?: string): Trace => {
  const trace: Trace = { calls: [], closed: 0, rows: [...rows] }

  const storeFor = (mode: string) => ({
    getAll: () => requestFor('getAll', mode, () => trace.rows),
    put: (value: StoredBook) =>
      requestFor('put', mode, () => {
        trace.rows = [...trace.rows.filter((row) => row.id !== value.id), value]
        return undefined
      }),
    delete: (id: string) =>
      requestFor('delete', mode, () => {
        trace.rows = trace.rows.filter((row) => row.id !== id)
        return undefined
      }),
  })

  const requestFor = (op: string, mode: string, run: () => unknown) => {
    trace.calls.push({ op, mode })
    const request: Record<string, unknown> = { result: undefined, error: new Error(op) }

    soon(() => {
      if (fails === op) {
        const onerror = request['onerror']
        if (typeof onerror === 'function') onerror()
        return
      }
      request['result'] = run()
      const onsuccess = request['onsuccess']
      if (typeof onsuccess === 'function') onsuccess()
    })

    return request
  }

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    transaction: (_store: string, mode: string) => ({ objectStore: () => storeFor(mode) }),
    close: () => {
      trace.closed++
    },
  }

  const factory = {
    open: () => {
      const request: Record<string, unknown> = { result: db, error: null }
      soon(() => {
        if (fails === 'open') {
          const onerror = request['onerror']
          if (typeof onerror === 'function') onerror()
          return
        }
        const onsuccess = request['onsuccess']
        if (typeof onsuccess === 'function') onsuccess()
      })
      return request
    },
  }

  Object.assign(globalThis, { indexedDB: factory })
  return trace
}

/** `indexedDB`가 아예 없는 환경. 어떤 브라우저와 시크릿 모드가 그렇다. */
const noStore = (): void => {
  Object.assign(globalThis, { indexedDB: undefined })
}

/** `open`이 곧바로 던지는 환경. 시크릿 모드가 그렇게 거절한다. */
const throwingStore = (): void => {
  Object.assign(globalThis, {
    indexedDB: {
      open: () => {
        throw new Error('refused')
      },
    },
  })
}

/** 실패한 `op`. 성공했으면 없음이다. */
const failedOp = (effect: Effect.Effect<unknown, DbError>): Promise<string | null> =>
  Effect.runPromise(
    effect.pipe(
      Effect.as(Option.none<string>()),
      Effect.catchTag('DbError', (error) => Effect.succeed(Option.some(error.op))),
      Effect.map(Option.getOrNull),
    ),
  )

afterEach(() => {
  Object.assign(globalThis, { indexedDB: undefined })
})

describe('the order the shelf comes back in', () => {
  test('the most recently imported book comes first', async () => {
    fakeStore([book('older', 1000), book('newest', 3000), book('middle', 2000)])

    const books = await Effect.runPromise(getAllBooks)

    expect(books.map(({ id }) => id)).toStrictEqual(['newest', 'middle', 'older'])
  })

  test('an empty store comes back empty rather than failing', async () => {
    fakeStore()

    expect(await Effect.runPromise(getAllBooks)).toStrictEqual([])
  })
})

describe('writing and removing', () => {
  test('a book written once comes back', async () => {
    fakeStore()

    await Effect.runPromise(putBook(book('volume-1', 1000)))
    const books = await Effect.runPromise(getAllBooks)

    expect(books.map(({ id }) => id)).toStrictEqual(['volume-1'])
  })

  test('writing the same id again replaces the record rather than adding one', async () => {
    fakeStore([book('volume-1', 1000)])

    await Effect.runPromise(putBook({ ...book('volume-1', 1000), title: 'Renamed' }))
    const books = await Effect.runPromise(getAllBooks)

    expect(books).toHaveLength(1)
    expect(books[0]?.title).toBe('Renamed')
  })

  test('a removed book is gone', async () => {
    fakeStore([book('volume-1', 1000), book('volume-2', 2000)])

    await Effect.runPromise(deleteBook('volume-1'))
    const books = await Effect.runPromise(getAllBooks)

    expect(books.map(({ id }) => id)).toStrictEqual(['volume-2'])
  })

  test('removing an id that is not there is not a failure', async () => {
    fakeStore()

    expect(await failedOp(deleteBook('never-existed'))).toBeNull()
  })

  test('reading takes a readonly transaction and writing a readwrite one', async () => {
    const trace = fakeStore([book('volume-1', 1000)])

    await Effect.runPromise(getAllBooks)
    await Effect.runPromise(putBook(book('volume-2', 2000)))
    await Effect.runPromise(deleteBook('volume-1'))

    expect(trace.calls).toStrictEqual([
      { op: 'getAll', mode: 'readonly' },
      { op: 'put', mode: 'readwrite' },
      { op: 'delete', mode: 'readwrite' },
    ])
  })
})

describe('the connection', () => {
  test('every call closes the connection it opened', async () => {
    const trace = fakeStore()

    await Effect.runPromise(getAllBooks)
    await Effect.runPromise(putBook(book('volume-1', 1000)))

    expect(trace.closed).toBe(2)
  })

  test('a failed request still closes the connection', async () => {
    const trace = fakeStore([], 'getAll')

    await failedOp(getAllBooks)

    expect(trace.closed).toBe(1)
  })
})

describe('when the store will not have us', () => {
  // 이 셋이 감싸지 않으면 책장이 알릴 수 있는 실패가 아니라 프로그램을 무너뜨리는
  // 결함이 된다.
  test('no indexedDB at all is reported as a failure to open', async () => {
    noStore()

    expect(await failedOp(getAllBooks)).toBe('open')
  })

  test('an open that throws is reported rather than thrown', async () => {
    throwingStore()

    expect(await failedOp(putBook(book('volume-1', 1000)))).toBe('open')
  })

  test('an open that errors is reported as a failure to open', async () => {
    fakeStore([], 'open')

    expect(await failedOp(getAllBooks)).toBe('open')
  })

  test('a request that errors is reported under the name of that request', async () => {
    fakeStore([], 'put')

    expect(await failedOp(putBook(book('volume-1', 1000)))).toBe('put')
  })
})
