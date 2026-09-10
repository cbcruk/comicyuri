import { Array, Duration, Effect, Option, Schema } from 'effect'
import { Command, File } from 'foldkit'
import { load, pushUrl } from 'foldkit/navigation'

import { ARCHIVE_ACCEPT } from './constant.ts'
import { deleteBook, getAllBooks, putBook } from './db.ts'
import type { StoredBook } from './db.ts'
import { Book } from './domain/index.ts'
import { describe } from './errors.ts'
import type { AppError } from './errors.ts'
import { bookFromStored, measurePages, storedBooksFromFiles } from './loader.ts'
import { Message } from './message.ts'
import { loadProgress, saveProgress, saveSettings } from './storage.ts'
import { makeCover } from './thumbnail.ts'
import { PageMark, Settings, Theme } from './types.ts'

/** 실패가 상태 줄에 머무르다 스스로 사라지기까지의 시간. */
const NOTICE_LINGER = Duration.seconds(4)

const summarise = (stored: StoredBook): Book.BookSummary =>
  Book.fromRecord(
    stored,
    Option.map(Option.fromNullishOr(stored.cover), (cover) => URL.createObjectURL(cover)),
  )

/**
 * 책장을 통째로 읽어 격자용으로 요약하면서, 찾은 표지마다 object URL을 만든다.
 *
 * 책장을 읽을 때마다 그것이 밀어내는 표지들에 대한 {@linkcode RevokeCoverUrls}가
 * 늘 따라붙는 이유가 이 URL들이다.
 */
export const LoadShelf = Command.define('LoadShelf', {
  messages: [Message.SucceededLoadShelf, Message.FailedLoadShelf],
  execute: getAllBooks.pipe(
    Effect.map((stored) => Message.SucceededLoadShelf({ books: Array.map(stored, summarise) })),
    Effect.catch((error) => Effect.succeed(Message.FailedLoadShelf({ text: describe(error) }))),
  ),
})

/**
 * 아카이브와 낱장 이미지를 고르는 파일 선택기를 연다.
 *
 * 취소해도 실패가 아니라 빈 목록으로 답하므로, 아무것도 고르지 않은 것과
 * 구별되지 않는다.
 */
export const SelectFiles = Command.define('SelectFiles', {
  messages: [Message.CompletedSelectFiles],
  execute: File.selectMultiple(ARCHIVE_ACCEPT).pipe(
    Effect.map((files) => Message.CompletedSelectFiles({ files })),
  ),
})

/**
 * NOTE: `File.selectMultiple`은 디렉터리를 요구하지 못해서 직접 만들었다. 화면
 * 밖의 input을 만들고 `change`와 `cancel` 양쪽에서 치우는 그 함수의 모양을
 * 그대로 따르되, `webkitdirectory`를 더했다.
 */
export const SelectFolder = Command.define('SelectFolder', {
  messages: [Message.CompletedSelectFiles],
  execute: Effect.callback<ReadonlyArray<File.File>>((resume, signal) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.style.display = 'none'

    const cleanup = () => input.remove()

    input.addEventListener('change', () => {
      const files = input.files ? Array.fromIterable(input.files) : Array.empty()
      cleanup()
      resume(Effect.succeed(files))
    })
    input.addEventListener('cancel', () => {
      cleanup()
      resume(Effect.succeed(Array.empty()))
    })
    signal.addEventListener('abort', cleanup)

    document.body.appendChild(input)
    input.click()
  }).pipe(Effect.map((files) => Message.CompletedSelectFiles({ files }))),
})

/** 책을 한 번 열어 유효한지 보고, 페이지를 세어 재고, 표지를 떠 둔다. */
const importOne = (record: StoredBook): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const book = yield* bookFromStored(record)
    const first = book.pages[0]

    // 크기는 지금 재 둔다. 그려야 알 수 있는 값이 되면 스프레드 묶기가 읽는
    // 도중에 바뀌고, 그러면 위치라는 개념이 무너진다.
    const pageSizes = yield* measurePages(book)

    const maybeCover = first
      ? // 표지가 없는 것은 겉모습의 문제다. object URL은 어느 쪽이든 놓아 준다.
        yield* makeCover(yield* first.load()).pipe(
          Effect.ensuring(Effect.sync(() => first.unload())),
          Effect.option,
        )
      : Option.none<Blob>()

    yield* putBook({
      id: record.id,
      title: record.title,
      source: record.source,
      names: record.names,
      blobs: record.blobs,
      createdAt: record.createdAt,
      pageCount: book.pages.length,
      pageSizes,
      cover: Option.getOrUndefined(maybeCover),
    })
  })

/**
 * 고른 파일을 책장 레코드로 바꿔 저장한다.
 *
 * 아카이브는 각각 한 권이 되고 낱장 이미지들은 한 권으로 묶이며, 들어오는 길에
 * 한 번씩 열어 페이지를 세고 표지를 뜬다.
 */
export const ImportFiles = Command.define('ImportFiles', {
  args: { files: Schema.Array(File.File) },
  messages: [Message.SucceededImportFiles, Message.FailedImportFiles],
  execute: ({ files }) =>
    storedBooksFromFiles(files).pipe(
      Effect.flatMap((records) => Effect.forEach(records, importOne, { discard: true })),
      Effect.as(Message.SucceededImportFiles()),
      Effect.catch((error) => Effect.succeed(Message.FailedImportFiles({ text: describe(error) }))),
    ),
})

/** 책 한 권을 책장에서 영영 지운다. */
export const DeleteBook = Command.define('DeleteBook', {
  args: { id: Schema.String },
  messages: [Message.SucceededDeleteBook, Message.FailedDeleteBook],
  execute: ({ id }) =>
    deleteBook(id).pipe(
      Effect.as(Message.SucceededDeleteBook()),
      Effect.catch((error) => Effect.succeed(Message.FailedDeleteBook({ text: describe(error) }))),
    ),
})

/** 다음에 열었을 때도 같은 모습이도록 설정을 저장한다. */
export const SaveSettings = Command.define('SaveSettings', {
  args: { settings: Settings },
  messages: [Message.CompletedSaveSettings],
  execute: ({ settings }) =>
    saveSettings(settings).pipe(Effect.as(Message.CompletedSaveSettings())),
})

/**
 * 테마는 Model이 이끄는 클래스가 아니라 문서 요소의 `data-theme` 속성이다.
 * Tailwind의 variant와 `color-scheme`이 둘 다 루트 요소를 보는데, 그 요소는
 * 어떤 뷰의 것도 아니기 때문이다.
 */
export const ApplyTheme = Command.define('ApplyTheme', {
  args: { theme: Theme },
  messages: [Message.CompletedApplyTheme],
  execute: ({ theme }) =>
    Effect.sync(() => {
      document.documentElement.dataset['theme'] = theme
    }).pipe(Effect.as(Message.CompletedApplyTheme())),
})

/**
 * 책장이 더 이상 그리지 않는 표지 object URL을 놓아 준다.
 *
 * 이것이 없으면 책장을 새로 읽을 때마다 직전에 읽은 표지들이 샌다. 표지가 큰
 * 책장이라면 무시할 수 없는 메모리다.
 */
export const RevokeCoverUrls = Command.define('RevokeCoverUrls', {
  args: { urls: Schema.Array(Schema.String) },
  messages: [Message.CompletedRevokeCoverUrls],
  execute: ({ urls }) =>
    Effect.sync(() => Array.forEach(urls, (url) => URL.revokeObjectURL(url))).pipe(
      Effect.as(Message.CompletedRevokeCoverUrls()),
    ),
})

/** 토큰이 그대로 돌아오므로 update가 방금 끝난 대기가 누구 것인지 알 수 있다. */
export const WaitBeforeClearingNotice = Command.define('WaitBeforeClearingNotice', {
  args: { token: Schema.Number },
  messages: [Message.CompletedWaitBeforeClearingNotice],
  execute: ({ token }) =>
    Effect.sleep(NOTICE_LINGER).pipe(
      Effect.as(Message.CompletedWaitBeforeClearingNotice({ token })),
    ),
})

/** 읽던 위치와 북마크. 리더를 만들기 전에 읽는다. */
export const LoadProgress = Command.define('LoadProgress', {
  args: { bookId: Schema.String },
  messages: [Message.CompletedLoadProgress],
  execute: ({ bookId }) =>
    Effect.map(loadProgress(bookId), (progress) =>
      Message.CompletedLoadProgress({
        bookId,
        page: progress.page,
        bookmarks: progress.bookmarks,
        marks: progress.marks,
      }),
    ),
})

/** 책을 어디까지 읽었는지 저장한 시각과 함께 남긴다. */
export const SaveProgress = Command.define('SaveProgress', {
  args: {
    bookId: Schema.String,
    page: Schema.Number,
    bookmarks: Schema.Array(Schema.Number),
    marks: Schema.Array(PageMark),
  },
  messages: [Message.CompletedSaveProgress],
  execute: ({ bookId, page, bookmarks, marks }) =>
    saveProgress(bookId, { page, bookmarks, marks, updatedAt: 0 }).pipe(
      Effect.as(Message.CompletedSaveProgress()),
    ),
})

/** 다른 라우트로 옮긴다. 히스토리를 쌓으므로 뒤로 가기가 동작한다. */
export const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

/** 애플리케이션 바깥의 URL을 브라우저에 넘기고 페이지를 떠난다. */
export const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})
