import { Command, click, expect, expectOutMessage, given, role, scene, text } from 'foldkit/scene'
import { describe, test } from 'vite-plus/test'

import { defaultSettings } from '../../types.ts'
import { LoadSpread, PreloadNeighbours } from './command.ts'
import { Message, OutMessage } from './message.ts'
import { Model, OpenState, SpreadState } from './model.ts'
import { update } from './update.ts'
import { view } from './view.ts'

const program = { update, view }

const readingModel = (page = 0, settings = defaultSettings): Model => ({
  bookId: 'volume-1::42',
  openState: OpenState.Ready({ title: 'Volume 1', pageCount: 6 }),
  spread: SpreadState.Shown({ panels: [{ page, url: `blob:${page}` }] }),
  page,
  bookmarks: [],
  settings,
})

const settleTurn = (page: number) => [
  Command.resolve(
    LoadSpread,
    Message.CompletedLoadSpread({
      page,
      panels: [{ page, url: `blob:${page}` }],
    }),
  ),
  Command.resolve(PreloadNeighbours, Message.CompletedPreloadNeighbours()),
]

describe('reading', () => {
  test('the stage shows the page and the toolbar counts it', () => {
    scene(
      program,
      given(readingModel()),
      expect(role('img', { name: 'Page 1' })).toHaveAttr('src', 'blob:0'),
      expect(text('1 / 6')).toExist(),
    )
  })

  test('next turns the page and the counter follows', () => {
    scene(
      program,
      given(readingModel()),
      click(role('button', { name: 'Next' })),
      ...settleTurn(1),
      expect(text('2 / 6')).toExist(),
      expect(role('img', { name: 'Page 2' })).toExist(),
    )
  })

  test('last jumps to the end of the book', () => {
    scene(
      program,
      given(readingModel()),
      click(role('button', { name: 'Last' })),
      ...settleTurn(5),
      expect(text('6 / 6')).toExist(),
    )
  })

  test('the shelf control asks the application to leave', () => {
    scene(
      program,
      given(readingModel()),
      click(role('button', { name: '← Shelf' })),
      expectOutMessage(OutMessage.RequestedExit()),
    )
  })
})

describe('layout controls', () => {
  test('the direction control shows and flips the reading direction', () => {
    scene(
      program,
      given(readingModel()),
      expect(role('button', { name: 'Toggle reading direction' })).toContainText('RTL'),
      click(role('button', { name: 'Toggle reading direction' })),
      expectOutMessage(
        OutMessage.ChangedSettings({
          settings: { ...defaultSettings, direction: 'ltr' },
        }),
      ),
      ...settleTurn(0),
      expect(role('button', { name: 'Toggle reading direction' })).toContainText('LTR'),
    )
  })

  test('the fit control names the mode it is in', () => {
    scene(
      program,
      given(readingModel()),
      expect(role('button', { name: 'Change how pages are fitted' })).toContainText('Fit'),
      click(role('button', { name: 'Change how pages are fitted' })),
      expectOutMessage(
        OutMessage.ChangedSettings({
          settings: { ...defaultSettings, fit: 'width' },
        }),
      ),
      ...settleTurn(0),
      expect(role('button', { name: 'Change how pages are fitted' })).toContainText('Width'),
    )
  })
})

describe('failure', () => {
  test('a book that could not be opened offers the way back', () => {
    scene(
      program,
      given({
        ...readingModel(),
        openState: OpenState.Failed({ text: 'Not a valid ZIP/CBZ archive' }),
      }),
      expect(text('Not a valid ZIP/CBZ archive')).toExist(),
      click(role('button', { name: '← Shelf' })),
      expectOutMessage(OutMessage.RequestedExit()),
    )
  })
})
