import { Option } from 'effect'
import { AsyncData } from 'foldkit'
import { UrlRequest } from 'foldkit/navigation'
import { Command, given, message, model, story } from 'foldkit/story'
import { fromString as urlFromString } from 'foldkit/url'
import type { Url } from 'foldkit/url'
import { describe, expect, test } from 'vite-plus/test'

import { FileDrop } from '@foldkit/ui'

import {
  ApplyTheme,
  LoadProgress,
  SelectFiles,
  DeleteBook,
  ImportFiles,
  LoadShelf,
  NavigateInternal,
  RevokeCoverUrls,
  SaveSettings,
  WaitBeforeClearingNotice,
} from './command.ts'
import { FILE_DROP_ID } from './constant.ts'
import type { Book } from './domain/index.ts'
import { Message } from './message.ts'
import type { Model } from './model.ts'
import { Notice, Shelf } from './model.ts'
import { AppRoute } from './route.ts'
import { defaultSettings } from './types.ts'
import { update } from './update.ts'

const book = (
  id: string,
  title: string,
  maybeCoverUrl: Option.Option<string> = Option.none(),
): Book.BookSummary => ({
  id,
  title,
  source: 'zip',
  maybePageCount: Option.some(12),
  maybeCoverUrl,
})

const shelfModel = (shelf: Shelf = Shelf.Success({ data: [] })): Model => ({
  route: AppRoute.Shelf(),
  settings: defaultSettings,
  shelf,
  notice: Notice.Idle(),
  fileDrop: FileDrop.init({ id: FILE_DROP_ID }),
  maybeReader: Option.none(),
})

const readerUrl: Url = Option.getOrThrow(urlFromString('https://comicyuri.test/book/volume-1::42'))

const cbz = new File(['pretend archive'], 'volume-1.cbz')

const titlesOf = (shelf: Shelf): ReadonlyArray<string> =>
  Option.match(AsyncData.getData(shelf), {
    onNone: () => [],
    onSome: (books) => books.map(({ title }) => title),
  })

describe('shelf', () => {
  test('a loaded shelf replaces the books and releases the previous covers', () => {
    story(
      update,
      given(
        shelfModel(
          Shelf.Success({
            data: [book('old::1', 'Old', Option.some('blob:old'))],
          }),
        ),
      ),
      message(Message.SucceededLoadShelf({ books: [book('new::1', 'New')] })),
      Command.expectExact(RevokeCoverUrls({ urls: ['blob:old'] })),
      Command.resolve(RevokeCoverUrls, Message.CompletedRevokeCoverUrls()),
      model((model) => {
        expect(titlesOf(model.shelf)).toStrictEqual(['New'])
      }),
    )
  })

  test('a first load that fails has nothing to keep on screen', () => {
    story(
      update,
      given(shelfModel(Shelf.Loading())),
      message(Message.FailedLoadShelf({ text: 'Shelf storage is unavailable' })),
      model((model) => {
        expect(model.shelf).toStrictEqual(Shelf.Failure({ error: 'Shelf storage is unavailable' }))
      }),
    )
  })

  test('a reload that fails keeps the books it already had', () => {
    story(
      update,
      given(shelfModel(Shelf.Success({ data: [book('kept::1', 'Kept')] }))),
      message(Message.FailedLoadShelf({ text: 'Shelf storage is unavailable' })),
      model((model) => {
        expect(model.shelf._tag).toBe('Stale')
        expect(titlesOf(model.shelf)).toStrictEqual(['Kept'])
      }),
    )
  })
})

describe('import', () => {
  test('picking files imports them and refreshes the shelf', () => {
    story(
      update,
      given(shelfModel(Shelf.Success({ data: [book('kept::1', 'Kept')] }))),
      message(Message.ClickedOpenFiles()),
      // The picker is a Command, so cancelling and picking are the same
      // Message with different payloads.
      Command.resolve(SelectFiles, Message.CompletedSelectFiles({ files: [cbz] })),
      model((model) => {
        expect(model.notice).toStrictEqual(Notice.Busy({ text: 'Importing…' }))
      }),
      Command.expectExact(ImportFiles({ files: [cbz] })),
      Command.resolve(ImportFiles, Message.SucceededImportFiles()),
      model((model) => {
        // The import is over, so the status line stops saying it is running.
        expect(model.notice._tag).toBe('Idle')
        // The books already on screen stay there while the reload runs.
        expect(model.shelf._tag).toBe('Refreshing')
        expect(titlesOf(model.shelf)).toStrictEqual(['Kept'])
      }),
      Command.resolve(LoadShelf, Message.SucceededLoadShelf({ books: [book('new::1', 'New')] })),
      Command.resolve(RevokeCoverUrls, Message.CompletedRevokeCoverUrls()),
      model((model) => {
        expect(titlesOf(model.shelf)).toStrictEqual(['New'])
      }),
    )
  })

  test('cancelling the picker imports nothing', () => {
    story(
      update,
      given(shelfModel()),
      message(Message.CompletedSelectFiles({ files: [] })),
      model((model) => {
        expect(model.notice._tag).toBe('Idle')
      }),
    )
  })

  test('a failed import is reported and leaves the shelf alone', () => {
    story(
      update,
      given(shelfModel(Shelf.Success({ data: [book('kept::1', 'Kept')] }))),
      message(
        Message.FailedImportFiles({
          text: 'No comic files found (images or .cbz/.zip)',
        }),
      ),
      model((model) => {
        expect(titlesOf(model.shelf)).toStrictEqual(['Kept'])
        expect(model.notice._tag).toBe('Failed')
      }),
      Command.resolve(
        WaitBeforeClearingNotice,
        Message.CompletedWaitBeforeClearingNotice({ token: 0 }),
      ),
      model((model) => {
        expect(model.notice._tag).toBe('Idle')
      }),
    )
  })
})

describe('notice', () => {
  test('a failure that arrived during an import survives it finishing', () => {
    story(
      update,
      given({
        ...shelfModel(),
        notice: Notice.Failed({ text: 'Shelf storage is unavailable', token: 0 }),
      }),
      message(Message.SucceededImportFiles()),
      model((model) => {
        expect(model.notice).toStrictEqual(
          Notice.Failed({ text: 'Shelf storage is unavailable', token: 0 }),
        )
      }),
      Command.resolve(LoadShelf, Message.SucceededLoadShelf({ books: [] })),
      Command.resolve(RevokeCoverUrls, Message.CompletedRevokeCoverUrls()),
    )
  })

  const failedModel = (text: string, token: number): Model => ({
    ...shelfModel(),
    notice: Notice.Failed({ text, token }),
  })

  test('a failure starts a wait carrying its own token', () => {
    story(
      update,
      given(shelfModel()),
      message(Message.FailedImportFiles({ text: 'Could not open book' })),
      model((model) => {
        expect(model.notice).toStrictEqual(Notice.Failed({ text: 'Could not open book', token: 0 }))
      }),
      Command.expectExact(WaitBeforeClearingNotice({ token: 0 })),
      Command.resolve(
        WaitBeforeClearingNotice,
        Message.CompletedWaitBeforeClearingNotice({ token: 0 }),
      ),
      model((model) => {
        expect(model.notice._tag).toBe('Idle')
      }),
    )
  })

  test('a wait started for an older failure is ignored when it lands', () => {
    story(
      update,
      given(failedModel('Second', 1)),
      message(Message.CompletedWaitBeforeClearingNotice({ token: 0 })),
      model((model) => {
        expect(model.notice).toStrictEqual(Notice.Failed({ text: 'Second', token: 1 }))
      }),
    )
  })

  test('a wait that lands after an import took over leaves it alone', () => {
    story(
      update,
      given({
        ...shelfModel(),
        notice: Notice.Busy({ text: 'Importing…' }),
      }),
      message(Message.CompletedWaitBeforeClearingNotice({ token: 0 })),
      model((model) => {
        expect(model.notice).toStrictEqual(Notice.Busy({ text: 'Importing…' }))
      }),
    )
  })
})

describe('delete', () => {
  test('deleting a book refreshes the shelf', () => {
    story(
      update,
      given(shelfModel(Shelf.Success({ data: [book('gone::1', 'Gone')] }))),
      message(Message.ClickedDeleteBook({ id: 'gone::1' })),
      Command.expectExact(DeleteBook({ id: 'gone::1' })),
      Command.resolve(DeleteBook, Message.SucceededDeleteBook()),
      Command.resolve(LoadShelf, Message.SucceededLoadShelf({ books: [] })),
      Command.resolve(RevokeCoverUrls, Message.CompletedRevokeCoverUrls()),
      model((model) => {
        expect(titlesOf(model.shelf)).toStrictEqual([])
      }),
    )
  })

  test('a failed delete is reported and the book stays', () => {
    story(
      update,
      given(shelfModel(Shelf.Success({ data: [book('stuck::1', 'Stuck')] }))),
      message(Message.ClickedDeleteBook({ id: 'stuck::1' })),
      Command.resolve(
        DeleteBook,
        Message.FailedDeleteBook({ text: 'Shelf storage is unavailable' }),
      ),
      model((model) => {
        expect(titlesOf(model.shelf)).toStrictEqual(['Stuck'])
        expect(model.notice).toStrictEqual(
          Notice.Failed({ text: 'Shelf storage is unavailable', token: 0 }),
        )
      }),
      Command.resolve(
        WaitBeforeClearingNotice,
        Message.CompletedWaitBeforeClearingNotice({ token: 0 }),
      ),
    )
  })
})

describe('settings', () => {
  test('toggling the theme flips it, persists it and applies it', () => {
    story(
      update,
      given(shelfModel()),
      message(Message.ClickedToggleTheme()),
      model((model) => {
        expect(model.settings.theme).toBe('light')
      }),
      Command.resolve(SaveSettings, Message.CompletedSaveSettings()),
      Command.resolve(ApplyTheme, Message.CompletedApplyTheme()),
      message(Message.ClickedToggleTheme()),
      model((model) => {
        expect(model.settings.theme).toBe('dark')
      }),
      Command.resolve(SaveSettings, Message.CompletedSaveSettings()),
      Command.resolve(ApplyTheme, Message.CompletedApplyTheme()),
    )
  })
})

describe('routing', () => {
  test('an internal link click navigates instead of loading the page', () => {
    story(
      update,
      given(shelfModel()),
      message(Message.ClickedLink({ request: UrlRequest.Internal({ url: readerUrl }) })),
      Command.expectExact(NavigateInternal({ url: 'https://comicyuri.test/book/volume-1::42' })),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
      model((model) => {
        // The runtime reports the new URL through ChangedUrl; the click
        // handler must not pre-write the route.
        expect(model.route._tag).toBe('Shelf')
      }),
    )
  })

  test('a url change moves the route and asks for the saved position', () => {
    story(
      update,
      given(shelfModel()),
      message(Message.ChangedUrl({ url: readerUrl })),
      model((model) => {
        expect(model.route).toStrictEqual(AppRoute.Reader({ id: 'volume-1::42' }))
        // The reader is not built until its saved position is known.
        expect(model.maybeReader).toStrictEqual(Option.none())
      }),
      Command.expectExact(LoadProgress({ bookId: 'volume-1::42' })),
      Command.resolve(
        LoadProgress,
        Message.CompletedLoadProgress({
          bookId: 'volume-1::42',
          page: 7,
          bookmarks: [2],
        }),
      ),
      model((model) => {
        expect(Option.map(model.maybeReader, (reader) => reader.page)).toStrictEqual(Option.some(7))
      }),
    )
  })
})
