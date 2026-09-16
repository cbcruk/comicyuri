/**
 * 책의 끝을 넘겼을 때 어느 책이 이웃인지(`R-216`).
 *
 * happy-dom에는 `indexedDB`가 없으므로 `src/io/db.test.ts`가 하듯 가짜를 세운다.
 * 재는 것은 저장소가 아니라, 책장의 순서를 그대로 따라가는지와 끝에서 멈추는지다.
 */

import { Effect, Option } from 'effect'
import { afterEach, describe, expect, test } from 'vite-plus/test'

import type { StoredBook } from '../../io/db.ts'
import { neighbourBookId } from './shelf.ts'

const book = (id: string, createdAt: number): StoredBook => ({
  id,
  title: id,
  source: 'zip',
  names: [`${id}.cbz`],
  blobs: [new Blob([id])],
  createdAt,
})

/** 다음 태스크에 콜백을 부른다. `db.ts`는 요청이 돌아온 뒤에 그것을 건다. */
const soon = (run: () => void): void => {
  setTimeout(run, 0)
}

/** 이 책들을 쥐고 있는 가짜 `indexedDB`를 세운다. */
const fakeStore = (rows: ReadonlyArray<StoredBook>): void => {
  const request = (result: unknown): Record<string, unknown> => {
    const pending: Record<string, unknown> = { result, error: null }

    soon(() => {
      const onsuccess = pending['onsuccess']
      if (typeof onsuccess === 'function') onsuccess()
    })

    return pending
  }

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    transaction: () => ({ objectStore: () => ({ getAll: () => request([...rows]) }) }),
    close: () => undefined,
  }

  Object.assign(globalThis, { indexedDB: { open: () => request(db) } })
}

afterEach(() => {
  Object.assign(globalThis, { indexedDB: undefined })
})

/** 책장은 최근에 들여온 것이 앞이므로(`S-102`) 여기서는 3권, 2권, 1권 순이다. */
const shelf = [book('volume-1', 100), book('volume-2', 200), book('volume-3', 300)]

describe('the book next to this one', () => {
  test('a step forward lands on the next book in shelf order', async () => {
    fakeStore(shelf)

    expect(await Effect.runPromise(neighbourBookId('volume-3', 1))).toStrictEqual(
      Option.some('volume-2'),
    )
  })

  test('a step back lands on the book before it', async () => {
    fakeStore(shelf)

    expect(await Effect.runPromise(neighbourBookId('volume-1', -1))).toStrictEqual(
      Option.some('volume-2'),
    )
  })

  test('the shelf does not wrap around at either end', async () => {
    fakeStore(shelf)

    expect(await Effect.runPromise(neighbourBookId('volume-1', 1))).toStrictEqual(Option.none())
    expect(await Effect.runPromise(neighbourBookId('volume-3', -1))).toStrictEqual(Option.none())
  })

  test('a book that is not on the shelf has no neighbour', async () => {
    fakeStore(shelf)

    expect(await Effect.runPromise(neighbourBookId('volume-9', 1))).toStrictEqual(Option.none())
  })

  test('a shelf that cannot be read leaves the reader where it is', async () => {
    expect(await Effect.runPromise(neighbourBookId('volume-1', 1))).toStrictEqual(Option.none())
  })
})
