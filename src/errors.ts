/**
 * Every failure the app can recover from or report, as an Effect tagged error.
 *
 * Modelling these in the error channel means `Effect.Effect<A, AppError>`
 * spells out what a call site has to handle, and `describe` is the single
 * place that turns a failure into text for the shelf status line.
 */

import { Array, Data, Match, Predicate } from 'effect'

/** IndexedDB refused an operation (`op` is the store call that failed). */
export class DbError extends Data.TaggedError('DbError')<{
  readonly op: string
  readonly cause: unknown
}> {}

/** A `.cbz` / `.zip` could not be parsed, read or inflated. */
export class ArchiveError extends Data.TaggedError('ArchiveError')<{
  readonly reason: string
  readonly cause?: unknown
}> {}

/** The archive or folder held no usable images. */
export class EmptyBookError extends Data.TaggedError('EmptyBookError')<{
  readonly title: string
}> {}

/** The picked files contained nothing importable. */
export class NoComicFilesError extends Data.TaggedError('NoComicFilesError')<{}> {}

/** The cover thumbnail could not be rendered — always recoverable. */
export class CoverError extends Data.TaggedError('CoverError')<{
  readonly reason: string
}> {}

/**
 * Every failure this application reports to the reader.
 *
 * {@linkcode describe} turns one into text, so a new member of this union is a
 * type error there until it has something to say.
 */
export type AppError = DbError | ArchiveError | EmptyBookError | NoComicFilesError | CoverError

const APP_ERROR_TAGS = [
  'DbError',
  'ArchiveError',
  'EmptyBookError',
  'NoComicFilesError',
  'CoverError',
] as const

const isAppError = (error: unknown): error is AppError =>
  Array.some(APP_ERROR_TAGS, (tag) => Predicate.isTagged(error, tag))

/** Human-readable text for the shelf status line. */
export const describe: (error: AppError) => string = Match.type<AppError>().pipe(
  Match.tag('DbError', (e) => `Shelf storage is unavailable (${e.op})`),
  Match.tag('ArchiveError', (e) => e.reason),
  Match.tag('EmptyBookError', (e) => `No images found in "${e.title}"`),
  Match.tag('NoComicFilesError', () => 'No comic files found (images or .cbz/.zip)'),
  Match.tag('CoverError', (e) => e.reason),
  Match.exhaustive,
)

/**
 * `describe` for a channel typed `unknown`. A ManagedResource reports its
 * acquire failure that way, so the tag has to be recovered before matching.
 */
export const describeUnknown = (error: unknown): string =>
  isAppError(error) ? describe(error) : 'Something went wrong'
