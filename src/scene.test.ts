import { Option } from 'effect'
import { Command, click, dropFiles, expect, given, role, scene, text } from 'foldkit/scene'
import { describe, test } from 'vite-plus/test'

import { FileDrop } from '@foldkit/ui'

import {
  ApplyTheme,
  DeleteBook,
  ImportFiles,
  LoadShelf,
  RevokeCoverUrls,
  SaveSettings,
  SelectFiles,
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
import { view } from './view/index.ts'

const book = (id: string, title: string): Book.BookSummary => ({
  id,
  title,
  source: 'zip',
  maybePageCount: Option.some(24),
  maybeCoverUrl: Option.none(),
})

const shelfModel = (
  shelf: Shelf = Shelf.Success({ data: [] }),
  notice: Notice = Notice.Idle(),
): Model => ({
  route: AppRoute.Shelf(),
  settings: defaultSettings,
  shelf,
  notice,
  fileDrop: FileDrop.init({ id: FILE_DROP_ID }),
  maybeReader: Option.none(),
})

const program = { update, view }

const shelfRegion = role('main', { name: 'Shelf' })

describe('shelf', () => {
  test('a shelf still loading does not claim to be empty', () => {
    scene(
      program,
      given(shelfModel(Shelf.Loading())),
      expect(text('Opening your shelf…')).toExist(),
      expect(text('Your shelf is empty')).not.toExist(),
    )
  })

  test('an empty shelf explains how to fill it', () => {
    scene(
      program,
      given(shelfModel()),
      expect(text('Your shelf is empty')).toExist(),
      expect(role('button', { name: 'Open files' })).toExist(),
      expect(role('button', { name: 'Open folder' })).toExist(),
    )
  })

  test('each book is a link named after it, with its page count', () => {
    scene(
      program,
      given(shelfModel(Shelf.Success({ data: [book('volume-1::42', 'Volume 1')] }))),
      expect(text('Your shelf is empty')).not.toExist(),
      expect(role('link', { name: 'Volume 1' })).toHaveAttr('href', '/book/volume-1::42'),
    )
  })

  test('a single-page book is not announced as "1 pages"', () => {
    scene(
      program,
      given(
        shelfModel(
          Shelf.Success({
            data: [
              {
                id: 'one::1',
                title: 'One',
                source: 'zip',
                maybePageCount: Option.some(1),
                maybeCoverUrl: Option.none(),
              },
            ],
          }),
        ),
      ),
      expect(text('1 page')).toExist(),
    )
  })

  test('a shelf that failed to open says so instead of showing an empty grid', () => {
    scene(
      program,
      given(shelfModel(Shelf.Failure({ error: 'Shelf storage is unavailable' }))),
      expect(text("Couldn't open your shelf — Shelf storage is unavailable")).toExist(),
      expect(text('Your shelf is empty')).not.toExist(),
    )
  })

  test('a reader route whose position is still loading says so', () => {
    scene(
      program,
      given({ ...shelfModel(), route: AppRoute.Reader({ id: 'volume-1::42' }) }),
      expect(role('heading', { name: 'Opening…' })).toExist(),
      expect(role('link', { name: 'Back to the shelf' })).toHaveAttr('href', '/'),
    )
  })
})

describe('interaction', () => {
  test('dropping an archive on the shelf imports it', () => {
    scene(
      program,
      given(shelfModel()),
      dropFiles(shelfRegion, [new File(['pretend archive'], 'volume-1.cbz')]),
      expect(text('Importing…')).toExist(),
      Command.resolve(ImportFiles, Message.SucceededImportFiles()),
      Command.resolve(
        LoadShelf,
        Message.SucceededLoadShelf({
          books: [book('volume-1::42', 'Volume 1')],
        }),
      ),
      Command.resolve(RevokeCoverUrls, Message.CompletedRevokeCoverUrls()),
      expect(text('Volume 1')).toExist(),
    )
  })

  test('a drop carrying no files is reported rather than imported', () => {
    scene(
      program,
      given(shelfModel()),
      dropFiles(shelfRegion, []),
      expect(text("Couldn't do that — Only files can be dropped here")).toExist(),
      Command.resolve(
        WaitBeforeClearingNotice,
        Message.CompletedWaitBeforeClearingNotice({ token: 0 }),
      ),
      expect(text("Couldn't do that — Only files can be dropped here")).not.toExist(),
    )
  })

  test('the open-files button reaches the picker', () => {
    scene(
      program,
      given(shelfModel()),
      click(role('button', { name: 'Open files' })),
      Command.expectExact(SelectFiles()),
      Command.resolve(SelectFiles, Message.CompletedSelectFiles({ files: [] })),
    )
  })

  test('removing a book from the shelf takes it out of the grid', () => {
    scene(
      program,
      given(shelfModel(Shelf.Success({ data: [book('gone::1', 'Gone')] }))),
      click(role('button', { name: 'Remove Gone from shelf' })),
      Command.resolve(DeleteBook, Message.SucceededDeleteBook()),
      Command.resolve(LoadShelf, Message.SucceededLoadShelf({ books: [] })),
      Command.resolve(RevokeCoverUrls, Message.CompletedRevokeCoverUrls()),
      expect(text('Your shelf is empty')).toExist(),
    )
  })

  test('the theme toggle says where it will take you and applies it', () => {
    scene(
      program,
      given(shelfModel()),
      expect(role('button', { name: 'Switch to light theme' })).toExist(),
      click(role('button', { name: 'Switch to light theme' })),
      Command.resolve(SaveSettings, Message.CompletedSaveSettings()),
      Command.resolve(ApplyTheme, Message.CompletedApplyTheme()),
      expect(role('button', { name: 'Switch to dark theme' })).toExist(),
    )
  })
})

describe('scoping', () => {
  test('every book gets its own named link and delete control', () => {
    scene(
      program,
      given(shelfModel(Shelf.Success({ data: [book('a::1', 'Alpha'), book('b::1', 'Beta')] }))),
      expect(role('link', { name: 'Alpha' })).toHaveAttr('href', '/book/a::1'),
      expect(role('link', { name: 'Beta' })).toHaveAttr('href', '/book/b::1'),
      expect(role('button', { name: 'Remove Alpha from shelf' })).toExist(),
      expect(role('button', { name: 'Remove Beta from shelf' })).toExist(),
    )
  })
})
