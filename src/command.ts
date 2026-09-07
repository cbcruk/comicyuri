import { Array, Duration, Effect, Option, Schema } from 'effect'
import { Command, File } from 'foldkit'
import { load, pushUrl } from 'foldkit/navigation'

import { ARCHIVE_ACCEPT } from './constant.ts'
import { deleteBook, getAllBooks, putBook } from './db.ts'
import type { StoredBook } from './db.ts'
import { Book } from './domain/index.ts'
import { describe } from './errors.ts'
import type { AppError } from './errors.ts'
import { bookFromStored, storedBooksFromFiles } from './loader.ts'
import { Message } from './message.ts'
import { saveSettings } from './storage.ts'
import { makeCover } from './thumbnail.ts'
import { Settings, Theme } from './types.ts'

/** How long a failure stays on the status line before it clears itself. */
const NOTICE_LINGER = Duration.seconds(4)

const summarise = (stored: StoredBook): Book.BookSummary =>
  Book.fromRecord(
    stored,
    Option.map(Option.fromNullishOr(stored.cover), (cover) => URL.createObjectURL(cover)),
  )

export const LoadShelf = Command.define('LoadShelf', {
  messages: [Message.SucceededLoadShelf, Message.FailedLoadShelf],
  execute: getAllBooks.pipe(
    Effect.map((stored) => Message.SucceededLoadShelf({ books: Array.map(stored, summarise) })),
    Effect.catch((error) => Effect.succeed(Message.FailedLoadShelf({ text: describe(error) }))),
  ),
})

export const SelectFiles = Command.define('SelectFiles', {
  messages: [Message.CompletedSelectFiles],
  execute: File.selectMultiple(ARCHIVE_ACCEPT).pipe(
    Effect.map((files) => Message.CompletedSelectFiles({ files })),
  ),
})

/**
 * NOTE: hand-rolled rather than `File.selectMultiple`, which cannot ask for a
 * directory. This mirrors that function's shape — an off-screen input, removed
 * on both `change` and `cancel` — with `webkitdirectory` added.
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

/** Opens the book once to validate it, count pages and snapshot a cover. */
const importOne = (record: StoredBook): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const book = yield* bookFromStored(record)
    const first = book.pages[0]

    const maybeCover = first
      ? // A missing cover is cosmetic; the object URL is released either way.
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
      cover: Option.getOrUndefined(maybeCover),
    })
  })

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

export const DeleteBook = Command.define('DeleteBook', {
  args: { id: Schema.String },
  messages: [Message.SucceededDeleteBook, Message.FailedDeleteBook],
  execute: ({ id }) =>
    deleteBook(id).pipe(
      Effect.as(Message.SucceededDeleteBook()),
      Effect.catch((error) => Effect.succeed(Message.FailedDeleteBook({ text: describe(error) }))),
    ),
})

export const SaveSettings = Command.define('SaveSettings', {
  args: { settings: Settings },
  messages: [Message.CompletedSaveSettings],
  execute: ({ settings }) =>
    saveSettings(settings).pipe(Effect.as(Message.CompletedSaveSettings())),
})

/**
 * The theme is a `data-theme` attribute on the document element rather than a
 * Model-driven class, because Tailwind's variant and `color-scheme` both key
 * off the root element, which no view owns.
 */
export const ApplyTheme = Command.define('ApplyTheme', {
  args: { theme: Theme },
  messages: [Message.CompletedApplyTheme],
  execute: ({ theme }) =>
    Effect.sync(() => {
      document.documentElement.dataset['theme'] = theme
    }).pipe(Effect.as(Message.CompletedApplyTheme())),
})

export const RevokeCoverUrls = Command.define('RevokeCoverUrls', {
  args: { urls: Schema.Array(Schema.String) },
  messages: [Message.CompletedRevokeCoverUrls],
  execute: ({ urls }) =>
    Effect.sync(() => Array.forEach(urls, (url) => URL.revokeObjectURL(url))).pipe(
      Effect.as(Message.CompletedRevokeCoverUrls()),
    ),
})

/** The token comes back untouched so update can tell whose wait just landed. */
export const WaitBeforeClearingNotice = Command.define('WaitBeforeClearingNotice', {
  args: { token: Schema.Number },
  messages: [Message.CompletedWaitBeforeClearingNotice],
  execute: ({ token }) =>
    Effect.sleep(NOTICE_LINGER).pipe(
      Effect.as(Message.CompletedWaitBeforeClearingNotice({ token })),
    ),
})

export const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

export const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})
