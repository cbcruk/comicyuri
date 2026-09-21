/** S-151 · 실패가 읽는 사람의 언어로 된 한 문장이 되는 자리. */

import { describe as group, expect, test } from 'vite-plus/test'

import { ArchiveError, CoverError, DbError, EmptyBookError, describe } from './errors.ts'
import type { ErrorWords } from './errors.ts'

/** 무엇이 불렸는지만 보이게 지은 문구들. 진짜 문구는 카탈로그에 있다. */
const words: ErrorWords = {
  db: (op) => `db:${op}`,
  emptyBook: (title) => `empty:${title}`,
  missingBook: (id) => `missing:${id}`,
  noComicFiles: 'noComicFiles',
  unknown: 'unknown',
  openBook: 'openBook',
  showPage: 'showPage',
  archive: {
    notAnArchive: 'notAnArchive',
    directoryCorrupt: 'directoryCorrupt',
    inflate: 'inflate',
    unsupportedMethod: (method) => `method:${method}`,
    unreadable: (name) => `unreadable:${name}`,
    pageMissing: (page) => `pageMissing:${page}`,
  },
  cover: {
    decode: 'decode',
    timeout: 'timeout',
    noCanvas: 'noCanvas',
    encode: 'encode',
  },
}

group('describe', () => {
  test('each failure asks the words it needs for, with what it knows', () => {
    expect(describe(new DbError({ op: 'open', cause: null }), words)).toBe('db:open')
    expect(describe(new EmptyBookError({ title: 'volume-1' }), words)).toBe('empty:volume-1')
    expect(describe(new CoverError({ reason: 'timeout' }), words)).toBe('timeout')
  })

  test('an archive failure says which of its reasons it was', () => {
    expect(describe(new ArchiveError({ reason: { kind: 'notAnArchive' } }), words)).toBe(
      'notAnArchive',
    )
    expect(
      describe(new ArchiveError({ reason: { kind: 'unsupportedMethod', method: 99 } }), words),
    ).toBe('method:99')
    expect(describe(new ArchiveError({ reason: { kind: 'pageMissing', page: 10 } }), words)).toBe(
      'pageMissing:10',
    )
  })
})
