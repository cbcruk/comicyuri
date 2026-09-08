import { Schema } from 'effect'
import { File } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { FileDrop } from '@foldkit/ui'

import { BookSummary } from './domain/book.ts'
import { Reader } from './page/index.ts'

/**
 * Everything that can happen to the application.
 *
 * Names say what happened, never what to do about it: `Clicked*` for something
 * the reader did, `Got*` for a child's message, `Succeeded*`/`Failed*` for how
 * an operation ended, and `Completed*` for one that cannot fail.
 */
export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},

  SucceededLoadShelf: { books: Schema.Array(BookSummary) },
  FailedLoadShelf: { text: Schema.String },

  GotFileDropMessage: { message: FileDrop.Message },
  ClickedOpenFiles: {},
  ClickedOpenFolder: {},
  CompletedSelectFiles: { files: Schema.Array(File.File) },
  SucceededImportFiles: {},
  FailedImportFiles: { text: Schema.String },

  ClickedDeleteBook: { id: Schema.String },
  SucceededDeleteBook: {},
  FailedDeleteBook: { text: Schema.String },

  ClickedToggleTheme: {},
  CompletedSaveSettings: {},
  CompletedApplyTheme: {},

  CompletedRevokeCoverUrls: {},
  CompletedWaitBeforeClearingNotice: { token: Schema.Number },

  GotReaderMessage: { message: Reader.Message },
  CompletedLoadProgress: {
    bookId: Schema.String,
    page: Schema.Number,
    bookmarks: Schema.Array(Schema.Number),
  },
  CompletedSaveProgress: {},
})

/** The decoded value of the {@linkcode Message} union. */
export type Message = typeof Message.Type
