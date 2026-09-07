import { Schema } from 'effect'
import { File } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { FileDrop } from '@foldkit/ui'

import { BookSummary } from './domain/book.ts'

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
})

export type Message = typeof Message.Type
