import { Option } from 'effect'
import {
  Command,
  click,
  dropFiles,
  expect,
  given,
  role,
  scene,
  selector,
  text,
} from 'foldkit/scene'
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
  maybePendingDelete: Option.none(),
  isSettingsOpen: false,
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
      expect(text('Importing…')).not.toExist(),
    )
  })

  test('the shelf carries no stray file input', () => {
    // 드롭 존 자신의 숨은 input은 그리지 않는다. 파일 대화상자는 헤더 버튼이
    // 이미 열고, `sr-only`는 요소를 감출 뿐 탭 순서에서 빼지는 않으므로, 남겨
    // 두면 책장 한복판에 보이지 않는 탭 정거장이 생긴다.
    scene(
      program,
      given(shelfModel()),
      expect(selector('input')).not.toExist(),
      expect(role('button', { name: 'Open files' })).toExist(),
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
      click(role('button', { name: 'Remove Gone from shelf…' })),
      // 🗑은 묻기만 한다. 지우는 것은 그 답이다.
      expect(text('Remove this book and where you left off?')).toExist(),
      click(role('button', { name: 'Remove Gone from shelf' })),
      Command.resolve(DeleteBook, Message.SucceededDeleteBook()),
      Command.resolve(LoadShelf, Message.SucceededLoadShelf({ books: [] })),
      Command.resolve(RevokeCoverUrls, Message.CompletedRevokeCoverUrls()),
      expect(text('Your shelf is empty')).toExist(),
    )
  })

  test('the settings control opens the same panel the reader has', () => {
    scene(
      program,
      given(shelfModel()),
      expect(role('dialog', { name: 'Reading settings' })).not.toExist(),
      click(role('button', { name: 'Reading settings' })),
      expect(role('dialog', { name: 'Reading settings' })).toExist(),
      // 리더의 패널과 같은 항목이 선다.
      expect(role('switch', { name: 'Cover on its own' })).toExist(),
      expect(role('button', { name: 'Go there' })).toExist(),
      click(role('button', { name: 'Close' })),
      expect(role('dialog', { name: 'Reading settings' })).not.toExist(),
    )
  })

  test('the panel shows the defaults as they stand', () => {
    scene(
      program,
      given({
        ...shelfModel(),
        settings: { ...defaultSettings, resume: 'ask', coverAlone: false },
        isSettingsOpen: true,
      }),
      expect(role('button', { name: 'Ask' })).toHaveAttr('aria-pressed', 'true'),
      expect(role('button', { name: 'Go there' })).toHaveAttr('aria-pressed', 'false'),
      expect(role('switch', { name: 'Cover on its own' })).toHaveAttr('aria-checked', 'false'),
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
      expect(role('button', { name: 'Remove Alpha from shelf…' })).toExist(),
      expect(role('button', { name: 'Remove Beta from shelf…' })).toExist(),
    )
  })

  test('the question stands on one card only, and keeping it puts the bin back', () => {
    scene(
      program,
      given(shelfModel(Shelf.Success({ data: [book('a::1', 'Alpha'), book('b::1', 'Beta')] }))),
      click(role('button', { name: 'Remove Alpha from shelf…' })),
      expect(role('group', { name: 'Remove Alpha?' })).toExist(),
      // 옆의 책은 묻지 않은 채로 남는다.
      expect(role('group', { name: 'Remove Beta?' })).not.toExist(),
      expect(role('button', { name: 'Remove Beta from shelf…' })).toExist(),
      click(role('button', { name: 'Keep Alpha' })),
      expect(role('group', { name: 'Remove Alpha?' })).not.toExist(),
      expect(role('button', { name: 'Remove Alpha from shelf…' })).toExist(),
    )
  })
})
