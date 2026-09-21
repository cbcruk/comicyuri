/** S-151 · 실패가 읽는 사람의 언어로 된 한 문장이 되는 자리. */

import { describe as group, expect, test } from 'vite-plus/test'

import { ArchiveError, CoverError, DbError, EmptyBookError, describe } from './errors.ts'
import type { TranslateError } from './errors.ts'

/** 어떤 키를 어떤 값과 함께 물었는지만 드러내는 가짜 번역기. */
const t: TranslateError = (key, values) =>
  values === undefined ? key : `${key}(${Object.entries(values).join(',')})`

group('describe', () => {
  test('each failure asks for the key that says it, with what it knows', () => {
    expect(describe(new DbError({ op: 'open', cause: null }), t)).toBe('error.db(op,open)')
    expect(describe(new EmptyBookError({ title: 'volume-1' }), t)).toBe(
      'error.emptyBook(title,volume-1)',
    )
    expect(describe(new CoverError({ reason: 'timeout' }), t)).toBe('error.cover.timeout')
  })

  test('an archive failure says which of its reasons it was', () => {
    expect(describe(new ArchiveError({ reason: { kind: 'notAnArchive' } }), t)).toBe(
      'error.archive.notAnArchive(kind,notAnArchive)',
    )
    expect(
      describe(new ArchiveError({ reason: { kind: 'unsupportedMethod', method: 99 } }), t),
    ).toBe('error.archive.unsupportedMethod(kind,unsupportedMethod,method,99)')
    expect(describe(new ArchiveError({ reason: { kind: 'pageMissing', page: 10 } }), t)).toBe(
      'error.archive.pageMissing(kind,pageMissing,page,10)',
    )
  })
})
