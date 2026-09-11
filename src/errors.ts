/**
 * 앱이 복구하거나 알릴 수 있는 모든 실패. Effect의 태그드 에러로 쓴다.
 *
 * 실패를 에러 채널에 두면 `Effect.Effect<A, AppError>`가 호출부에서 무엇을
 * 다뤄야 하는지 그대로 말해 준다. 실패를 책장 상태 줄의 문장으로 바꾸는 곳은
 * `describe` 한 군데뿐이다.
 */

import { Array, Data, Match, Predicate } from 'effect'

/** IndexedDB가 작업을 거절했다(`op`는 실패한 스토어 호출). */
export class DbError extends Data.TaggedError('DbError')<{
  readonly op: string
  readonly cause: unknown
}> {}

/** `.cbz` / `.zip`을 파싱하거나 읽거나 풀지 못했다. */
export class ArchiveError extends Data.TaggedError('ArchiveError')<{
  readonly reason: string
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

/** 표지 썸네일을 그리지 못했다 — 언제나 복구할 수 있는 실패다. */
export class CoverError extends Data.TaggedError('CoverError')<{
  readonly reason: string
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

const APP_ERROR_TAGS = [
  'DbError',
  'ArchiveError',
  'EmptyBookError',
  'MissingBookError',
  'NoComicFilesError',
  'CoverError',
] as const

const isAppError = (error: unknown): error is AppError =>
  Array.some(APP_ERROR_TAGS, (tag) => Predicate.isTagged(error, tag))

/** 책장 상태 줄에 그대로 걸 수 있는 문장. */
export const describe: (error: AppError) => string = Match.type<AppError>().pipe(
  Match.tag('DbError', (e) => `Shelf storage is unavailable (${e.op})`),
  Match.tag('ArchiveError', (e) => e.reason),
  Match.tag('EmptyBookError', (e) => `No images found in "${e.title}"`),
  Match.tag('MissingBookError', (e) => `That book is no longer on the shelf ("${e.id}")`),
  Match.tag('NoComicFilesError', () => 'No comic files found (images or .cbz/.zip)'),
  Match.tag('CoverError', (e) => e.reason),
  Match.exhaustive,
)

/**
 * 채널이 `unknown`으로 타입 지어진 경우의 `describe`. ManagedResource는 획득
 * 실패를 그렇게 알리므로, 매칭하기 전에 태그를 되찾아야 한다.
 */
export const describeUnknown = (error: unknown): string =>
  isAppError(error) ? describe(error) : 'Something went wrong'
