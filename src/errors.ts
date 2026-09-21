/**
 * 앱이 복구하거나 알릴 수 있는 모든 실패. Effect의 태그드 에러로 쓴다.
 *
 * 실패를 에러 채널에 두면 `Effect.Effect<A, AppError>`가 호출부에서 무엇을
 * 다뤄야 하는지 그대로 말해 준다. 실패를 읽는 사람에게 보일 문장으로 바꾸는 곳은
 * `describe` 한 군데뿐이다.
 */

import { Data, Match } from 'effect'

/** IndexedDB가 작업을 거절했다(`op`는 실패한 호출 — `open`이거나 스토어 호출). */
export class DbError extends Data.TaggedError('DbError')<{
  readonly op: string
  readonly cause: unknown
}> {}

/**
 * 아카이브를 읽지 못한 까닭. 문장이 아니라 무엇이 잘못됐는지의 이름이다(`S-151`).
 *
 * 문장으로 바꾸는 일은 {@linkcode describe}가 화면의 언어로 한다. io 계층이 영어 문장을
 * 지고 다니면 그 문장을 옮길 자리가 없다.
 */
export type ArchiveReason =
  | { readonly kind: 'notAnArchive' }
  | { readonly kind: 'directoryCorrupt' }
  | { readonly kind: 'inflate' }
  | { readonly kind: 'unsupportedMethod'; readonly method: number }
  /** 그 이름의 파일이나 엔트리를 읽지 못했다. */
  | { readonly kind: 'unreadable'; readonly name: string }
  /** 책에 없는 페이지를 찾았다. `page`는 1부터 센 번호다. */
  | { readonly kind: 'pageMissing'; readonly page: number }

/**
 * 페이지 바이트를 읽지 못했다. `.cbz` / `.zip`의 파싱·풀기 실패와 낱장 이미지 읽기
 * 실패가 여기 든다.
 */
export class ArchiveError extends Data.TaggedError('ArchiveError')<{
  readonly reason: ArchiveReason
  readonly cause?: unknown
}> {}

/** 아카이브나 폴더에 쓸 만한 이미지가 없었다. */
export class EmptyBookError extends Data.TaggedError('EmptyBookError')<{
  readonly title: string
}> {}

/**
 * 그 id를 가진 책이 책장에 없었다.
 *
 * 책을 지운 뒤에도 살아 있는 링크나 북마크가 여기로 온다. 열어 보니 비어 있는
 * {@linkcode EmptyBookError}와 다르다 — 열어 볼 것 자체가 없었다.
 */
export class MissingBookError extends Data.TaggedError('MissingBookError')<{
  readonly id: string
}> {}

/** 고른 파일 중에 들여올 수 있는 것이 없었다. */
export class NoComicFilesError extends Data.TaggedError('NoComicFilesError')<{}> {}

/** 표지를 그리지 못한 까닭. {@linkcode ArchiveReason}과 같은 이유로 이름만 남긴다. */
export type CoverReason = 'decode' | 'timeout' | 'noCanvas' | 'encode'

/** 표지 썸네일을 그리지 못했다 — 언제나 복구할 수 있는 실패다. */
export class CoverError extends Data.TaggedError('CoverError')<{
  readonly reason: CoverReason
}> {}

/**
 * 이 애플리케이션이 읽는 사람에게 알리는 모든 실패.
 *
 * {@linkcode describe}가 이것을 문장으로 바꾸므로, 유니온에 새 멤버를 더하면
 * 할 말이 생기기 전까지 그곳에서 타입 에러가 난다.
 */
export type AppError =
  | DbError
  | ArchiveError
  | EmptyBookError
  | MissingBookError
  | NoComicFilesError
  | CoverError

/**
 * 실패를 문장으로 바꾸는 데 필요한 문구들. 화면의 언어로 된 카탈로그가 이 모양이다(`S-151`).
 *
 * 문구를 받아 쓰는 이유는 이 모듈이 화면 아래에 있기 때문이다. 언어를 아는 것은 화면이고,
 * 여기서 아는 것은 무엇이 잘못됐는지까지다.
 */
export type ErrorWords = Readonly<{
  db: (op: string) => string
  emptyBook: (title: string) => string
  missingBook: (id: string) => string
  noComicFiles: string
  unknown: string
  /** 책을 열다 실패했는데 까닭을 찾지 못했을 때. */
  openBook: string
  /** 페이지를 부르다 실패했는데 까닭을 찾지 못했을 때. */
  showPage: string
  archive: Readonly<{
    notAnArchive: string
    directoryCorrupt: string
    inflate: string
    unsupportedMethod: (method: number) => string
    unreadable: (name: string) => string
    pageMissing: (page: number) => string
  }>
  cover: Readonly<Record<CoverReason, string>>
}>

/** 아카이브 실패의 까닭 하나를 문장으로. */
const describeArchive = (reason: ArchiveReason, words: ErrorWords['archive']): string => {
  switch (reason.kind) {
    case 'notAnArchive':
      return words.notAnArchive
    case 'directoryCorrupt':
      return words.directoryCorrupt
    case 'inflate':
      return words.inflate
    case 'unsupportedMethod':
      return words.unsupportedMethod(reason.method)
    case 'unreadable':
      return words.unreadable(reason.name)
    case 'pageMissing':
      return words.pageMissing(reason.page)
  }
}

/**
 * 읽는 사람에게 그대로 보여 줄 수 있는 문장. 책장 상태 줄과 리더의 실패 화면이
 * 함께 쓴다.
 */
export const describe = (error: AppError, words: ErrorWords): string =>
  Match.value(error).pipe(
    Match.tag('DbError', (e) => words.db(e.op)),
    Match.tag('ArchiveError', (e) => describeArchive(e.reason, words.archive)),
    Match.tag('EmptyBookError', (e) => words.emptyBook(e.title)),
    Match.tag('MissingBookError', (e) => words.missingBook(e.id)),
    Match.tag('NoComicFilesError', () => words.noComicFiles),
    Match.tag('CoverError', (e) => words.cover[e.reason]),
    Match.exhaustive,
  )
