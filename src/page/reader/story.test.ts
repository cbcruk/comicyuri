import {
  Command,
  expectNoOutMessage,
  expectOutMessage,
  given,
  message,
  model,
  story,
} from 'foldkit/story'
import { describe, expect, test } from 'vite-plus/test'

import { defaultSettings } from '../../types.ts'
import { LoadSpread, PreloadNeighbours } from './command.ts'
import { Message, OutMessage } from './message.ts'
import { Model, OpenState, SpreadState, init } from './model.ts'
import { update } from './update.ts'

const PAGE_COUNT = 6

const openingModel = (settings = defaultSettings): Model =>
  init({ bookId: 'volume-1::42', page: 0, bookmarks: [], settings })

const acknowledgePreload = Command.resolve(PreloadNeighbours, Message.CompletedPreloadNeighbours())

/** Opens the book and settles the first spread, the state every test starts from. */
const opened = (page: number) => [
  message(Message.CompletedOpenBook({ title: 'Volume 1', pageCount: PAGE_COUNT })),
  Command.expectHas(LoadSpread({ page, pages: [page] })),
  Command.resolve(
    LoadSpread,
    Message.CompletedLoadSpread({
      page,
      panels: [{ page, url: `blob:${page}` }],
    }),
  ),
  acknowledgePreload,
]

describe('opening', () => {
  test('a book that opens shows its first spread and reports the position', () => {
    story(
      update,
      given(openingModel()),
      message(Message.CompletedOpenBook({ title: 'Volume 1', pageCount: PAGE_COUNT })),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 0,
          bookmarks: [],
        }),
      ),
      model((model) => {
        expect(model.openState).toStrictEqual(
          OpenState.Ready({ title: 'Volume 1', pageCount: PAGE_COUNT }),
        )
        expect(model.spread._tag).toBe('Loading')
      }),
      Command.resolve(
        LoadSpread,
        Message.CompletedLoadSpread({
          page: 0,
          panels: [{ page: 0, url: 'blob:0' }],
        }),
      ),
      acknowledgePreload,
      model((model) => {
        expect(model.spread).toStrictEqual(
          SpreadState.Shown({ panels: [{ page: 0, url: 'blob:0' }] }),
        )
      }),
    )
  })

  test('a book that cannot be opened says so instead of showing a stage', () => {
    story(
      update,
      given(openingModel()),
      message(Message.FailedOpenBook({ text: 'Not a valid ZIP/CBZ archive' })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.openState).toStrictEqual(
          OpenState.Failed({ text: 'Not a valid ZIP/CBZ archive' }),
        )
      }),
    )
  })
})

describe('turning pages', () => {
  test('next advances one page and reports the new position', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedNext()),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 1,
          bookmarks: [],
        }),
      ),
      model((model) => {
        expect(model.page).toBe(1)
      }),
      Command.resolve(
        LoadSpread,
        Message.CompletedLoadSpread({
          page: 1,
          panels: [{ page: 1, url: 'blob:1' }],
        }),
      ),
      acknowledgePreload,
    )
  })

  test('previous on the first page stays put', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedPrevious()),
      model((model) => {
        expect(model.page).toBe(0)
      }),
      Command.resolve(
        LoadSpread,
        Message.CompletedLoadSpread({
          page: 0,
          panels: [{ page: 0, url: 'blob:0' }],
        }),
      ),
      acknowledgePreload,
    )
  })

  test('a spread that arrives after the reader moved on is discarded', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedNext()),
      // The answer for page 0 lands late.
      Command.resolve(
        LoadSpread,
        Message.CompletedLoadSpread({
          page: 0,
          panels: [{ page: 0, url: 'blob:stale' }],
        }),
      ),
      acknowledgePreload,
      model((model) => {
        expect(model.spread._tag).toBe('Loading')
      }),
    )
  })
})

describe('keyboard', () => {
  test('in right-to-left reading the left key advances', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.PressedKey({ key: 'ArrowLeft' })),
      model((model) => {
        expect(model.page).toBe(1)
      }),
      Command.resolve(
        LoadSpread,
        Message.CompletedLoadSpread({
          page: 1,
          panels: [{ page: 1, url: 'blob:1' }],
        }),
      ),
      acknowledgePreload,
    )
  })

  test('in left-to-right reading the same key goes back', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, direction: 'ltr' })),
      ...opened(0),
      message(Message.ClickedNext()),
      Command.resolve(
        LoadSpread,
        Message.CompletedLoadSpread({
          page: 1,
          panels: [{ page: 1, url: 'blob:1' }],
        }),
      ),
      acknowledgePreload,
      message(Message.PressedKey({ key: 'ArrowLeft' })),
      model((model) => {
        expect(model.page).toBe(0)
      }),
      Command.resolve(
        LoadSpread,
        Message.CompletedLoadSpread({
          page: 0,
          panels: [{ page: 0, url: 'blob:0' }],
        }),
      ),
      acknowledgePreload,
    )
  })

  test('escape asks the application to leave', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.PressedKey({ key: 'Escape' })),
      expectOutMessage(OutMessage.RequestedExit()),
    )
  })

  test('an unbound key changes nothing', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.PressedKey({ key: 'q' })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.page).toBe(0)
      }),
    )
  })
})

describe('layout', () => {
  test('two-page mode regroups around the page being read', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedToggleView()),
      expectOutMessage(
        OutMessage.ChangedSettings({
          settings: { ...defaultSettings, view: 'spread' },
        }),
      ),
      model((model) => {
        expect(model.settings.view).toBe('spread')
      }),
      // The cover stays on its own, so page 0 is still a single-page spread.
      Command.expectHas(LoadSpread({ page: 0, pages: [0] })),
      Command.resolve(
        LoadSpread,
        Message.CompletedLoadSpread({
          page: 0,
          panels: [{ page: 0, url: 'blob:0' }],
        }),
      ),
      acknowledgePreload,
    )
  })

  test('cycling the fit mode walks the four modes and comes back', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedCycleFit()),
      model((model) => {
        expect(model.settings.fit).toBe('width')
      }),
      Command.resolve(LoadSpread, Message.CompletedLoadSpread({ page: 0, panels: [] })),
      acknowledgePreload,
    )
  })
})
