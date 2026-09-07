/**
 * Every failure the app can recover from or report, as an Effect tagged error.
 *
 * Modelling these in the error channel means `Effect.Effect<A, AppError>`
 * spells out what a call site has to handle, and `describe` is the single
 * place that turns a failure into text for the shelf status line.
 */

import { Data, Match } from 'effect'

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

export type AppError = DbError | ArchiveError | EmptyBookError | NoComicFilesError | CoverError

/** Human-readable text for the shelf status line. */
export const describe: (error: AppError) => string = Match.type<AppError>().pipe(
  Match.tag('DbError', (e) => `Shelf storage is unavailable (${e.op})`),
  Match.tag('ArchiveError', (e) => e.reason),
  Match.tag('EmptyBookError', (e) => `No images found in "${e.title}"`),
  Match.tag('NoComicFilesError', () => 'No comic files found (images or .cbz/.zip)'),
  Match.tag('CoverError', (e) => e.reason),
  Match.exhaustive,
)
