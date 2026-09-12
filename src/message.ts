import { Schema } from 'effect'
import { File } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { FileDrop } from '@foldkit/ui'

import { BookSummary } from './domain/book.ts'
import { BookSettings, PageMark, Rotation } from './types.ts'
import { Reader } from './page/index.ts'

/**
 * 애플리케이션에 일어날 수 있는 모든 일.
 *
 * 이름은 무엇이 일어났는지만 말하고 그래서 무엇을 할지는 말하지 않는다.
 * `Clicked*`는 읽는 사람이 한 일, `Got*`은 자식의 메시지,
 * `Succeeded*`/`Failed*`는 작업이 끝난 방식, `Completed*`는 실패할 수 없는
 * 작업이다.
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

  /** 🗑을 눌렀다. 지우는 것이 아니라 지울지 묻는 것이다. */
  ClickedDeleteBook: { id: Schema.String },
  ClickedConfirmDeleteBook: { id: Schema.String },
  ClickedCancelDeleteBook: {},
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
    marks: Schema.Array(PageMark),
    rotation: Rotation,
    maybeSettings: Schema.Option(BookSettings),
  },
  CompletedSaveProgress: {},
  CompletedSaveBookSettings: {},
})

/** {@linkcode Message} 유니온의 디코딩된 값. */
export type Message = typeof Message.Type
