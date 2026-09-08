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
import { LoadSpread, LoadThumbs, PreloadNeighbours, ToggleFullscreen } from './command.ts'
import { Message, OutMessage } from './message.ts'
import { DOUBLE_TAP_ZOOM, ORIGIN, ZOOM_MIN } from './gesture.ts'
import { Model, OpenState, SpreadState, init } from './model.ts'
import { update } from './update.ts'

const PAGE_COUNT = 6

const openingModel = (settings = defaultSettings): Model =>
  init({ bookId: 'volume-1::42', page: 0, bookmarks: [], settings })

const acknowledgePreload = Command.resolve(PreloadNeighbours, Message.CompletedPreloadNeighbours())

/** Answers the load a turn asked for, whatever page it landed on. */
const settle = (page: number) => [
  Command.resolve(
    LoadSpread,
    Message.CompletedLoadSpread({
      page,
      panels: [{ page, url: `blob:${page}` }],
    }),
  ),
  acknowledgePreload,
]

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

describe('gestures', () => {
  const press = (pointerId: number, x: number) =>
    message(Message.PressedPointer({ pointerId, at: { x, y: 0 } }))
  const move = (pointerId: number, x: number) =>
    message(Message.MovedPointer({ pointerId, at: { x, y: 0 } }))
  const release = (pointerId: number, x: number, timeStamp = 5000) =>
    message(
      Message.ReleasedPointer({
        pointerId,
        at: { x, y: 0 },
        timeStamp,
        viewportWidth: 600,
      }),
    )

  test('a tap on the forward zone turns the page', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      // Right-to-left reading, so the left third advances.
      press(1, -250),
      release(1, -250),
      model((model) => {
        expect(model.page).toBe(1)
      }),
      ...settle(1),
    )
  })

  test('a tap in the middle toggles the chrome and stays on the page', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, 0),
      release(1, 0),
      model((model) => {
        expect(model.isChromeVisible).toBe(false)
        expect(model.page).toBe(0)
      }),
    )
  })

  test('dragging leftwards asks for the right-hand page', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, 0),
      move(1, -80),
      release(1, -80),
      model((model) => {
        // In right-to-left reading the right-hand page is the previous one,
        // and page 0 has none, so the position holds.
        expect(model.page).toBe(0)
      }),
      ...settle(0),
    )
  })

  test('two fingers zoom, and lifting one leaves the other panning', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, -50),
      press(2, 50),
      // The span between the fingers doubles, so the zoom does too.
      move(2, 150),
      model((model) => {
        expect(model.zoom).toBeCloseTo(2)
        expect(model.gesture._tag).toBe('Pinching')
      }),
      release(2, 150),
      model((model) => {
        expect(model.gesture._tag).toBe('Tracking')
        expect(model.zoom).toBeCloseTo(2)
      }),
      release(1, -50),
      model((model) => {
        expect(model.gesture._tag).toBe('Idle')
      }),
    )
  })

  test('a drag pans instead of turning the page once zoomed in', () => {
    story(
      update,
      given({ ...openingModel(), zoom: 2 }),
      ...opened(0),
      press(1, 0),
      move(1, -40),
      model((model) => {
        expect(model.pan.x).toBe(-40)
      }),
      release(1, -40),
      model((model) => {
        expect(model.page).toBe(0)
        expect(model.gesture._tag).toBe('Idle')
      }),
    )
  })

  test('a double tap zooms in, and the next pair zooms back out', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, 0),
      release(1, 0, 1000),
      press(1, 0),
      release(1, 0, 1100),
      model((model) => {
        expect(model.zoom).toBeCloseTo(DOUBLE_TAP_ZOOM)
      }),
      press(1, 0),
      release(1, 0, 1200),
      press(1, 0),
      release(1, 0, 1300),
      model((model) => {
        expect(model.zoom).toBe(ZOOM_MIN)
        expect(model.pan).toStrictEqual(ORIGIN)
      }),
    )
  })
})

describe('chrome', () => {
  test('a wait from before the last activity does not hide the chrome', () => {
    story(
      update,
      given({ ...openingModel(), activityToken: 3 }),
      message(Message.ElapsedChromeIdle({ token: 0 })),
      model((model) => {
        expect(model.isChromeVisible).toBe(true)
      }),
    )
  })

  test('the wait for the current activity hides it', () => {
    story(
      update,
      given({ ...openingModel(), activityToken: 3 }),
      message(Message.ElapsedChromeIdle({ token: 3 })),
      model((model) => {
        expect(model.isChromeVisible).toBe(false)
      }),
    )
  })

  test('a press restarts the wait but leaves the chrome as it found it', () => {
    // Revealing on the way down would make every middle tap resolve to hidden,
    // because the release toggles from whatever the press left behind.
    story(
      update,
      given({ ...openingModel(), isChromeVisible: false, activityToken: 3 }),
      message(Message.PressedPointer({ pointerId: 1, at: { x: 0, y: 0 } })),
      model((model) => {
        expect(model.isChromeVisible).toBe(false)
        expect(model.activityToken).toBe(4)
      }),
    )
  })

  test('a middle tap brings hidden chrome back', () => {
    story(
      update,
      given({ ...openingModel(), isChromeVisible: false }),
      ...opened(0),
      message(Message.PressedPointer({ pointerId: 1, at: { x: 0, y: 0 } })),
      message(
        Message.ReleasedPointer({
          pointerId: 1,
          at: { x: 0, y: 0 },
          timeStamp: 5000,
          viewportWidth: 600,
        }),
      ),
      model((model) => {
        expect(model.isChromeVisible).toBe(true)
      }),
    )
  })

  test('a key brings the chrome back', () => {
    story(
      update,
      given({ ...openingModel(), isChromeVisible: false }),
      ...opened(0),
      message(Message.PressedKey({ key: 'ArrowLeft' })),
      model((model) => {
        expect(model.isChromeVisible).toBe(true)
      }),
      ...settle(1),
    )
  })
})

describe('page slider', () => {
  test('opening a book gives the slider the book’s range', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      model((model) => {
        expect(model.slider.min).toBe(0)
        expect(model.slider.max).toBe(PAGE_COUNT - 1)
      }),
    )
  })
})

describe('bookmarks', () => {
  test('bookmarking a page reports the new set, and unbookmarking removes it', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedToggleBookmark()),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 0,
          bookmarks: [0],
        }),
      ),
      model((model) => {
        expect(model.bookmarks).toStrictEqual([0])
      }),
      message(Message.ClickedToggleBookmark()),
      model((model) => {
        expect(model.bookmarks).toStrictEqual([])
      }),
    )
  })

  test('bookmarks stay in page order however they were added', () => {
    story(
      update,
      given({ ...openingModel(), bookmarks: [4] }),
      ...opened(0),
      message(Message.ClickedToggleBookmark()),
      model((model) => {
        expect(model.bookmarks).toStrictEqual([0, 4])
      }),
    )
  })
})

describe('fullscreen', () => {
  test('the control asks, and the document reports what happened', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedToggleFullscreen()),
      Command.expectExact(ToggleFullscreen({ wantFullscreen: true })),
      Command.resolve(ToggleFullscreen, Message.CompletedToggleFullscreen()),
      model((model) => {
        // Asking is not entering; the document has not said so yet.
        expect(model.isFullscreen).toBe(false)
      }),
      message(Message.ChangedFullscreen({ isFullscreen: true })),
      model((model) => {
        expect(model.isFullscreen).toBe(true)
      }),
    )
  })

  test('leaving fullscreen outside the app is still noticed', () => {
    story(
      update,
      given({ ...openingModel(), isFullscreen: true }),
      ...opened(0),
      message(Message.ChangedFullscreen({ isFullscreen: false })),
      model((model) => {
        expect(model.isFullscreen).toBe(false)
      }),
    )
  })
})

describe('thumbnails', () => {
  test('opening the grid asks only for the thumbnails it can show', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedToggleThumbs()),
      model((model) => {
        expect(model.isThumbsOpen).toBe(true)
      }),
      Command.resolve(
        LoadThumbs,
        Message.CompletedLoadThumbs({
          panels: [{ page: 0, url: 'blob:t0' }],
        }),
      ),
      model((model) => {
        expect(model.thumbPanels).toStrictEqual([{ page: 0, url: 'blob:t0' }])
      }),
    )
  })

  test('picking a thumbnail jumps there and closes the grid', () => {
    story(
      update,
      given({ ...openingModel(), isThumbsOpen: true }),
      ...opened(0),
      message(Message.SelectedThumb({ page: 3 })),
      model((model) => {
        expect(model.page).toBe(3)
        expect(model.isThumbsOpen).toBe(false)
        // The grid is gone, so its thumbnails are free to be released.
        expect(model.thumbPanels).toStrictEqual([])
      }),
      ...settle(3),
    )
  })

  test('a page turn does not release pages the grid is showing', () => {
    story(
      update,
      given({
        ...openingModel(),
        isThumbsOpen: true,
        thumbPanels: [{ page: 5, url: 'blob:t5' }],
      }),
      ...opened(0),
      message(Message.ClickedNext()),
      Command.expectHas(
        PreloadNeighbours({
          warm: [0, 1, 2],
          // Page 5 is not near the reader, but the grid is showing it.
          keep: [0, 1, 2, 3, 4, 5],
        }),
      ),
      ...settle(1),
    )
  })
})

describe('escape', () => {
  test('escape closes the grid before it leaves anything', () => {
    story(
      update,
      given({ ...openingModel(), isThumbsOpen: true, isFullscreen: true }),
      ...opened(0),
      message(Message.PressedKey({ key: 'Escape' })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.isThumbsOpen).toBe(false)
        expect(model.isFullscreen).toBe(true)
      }),
    )
  })

  test('escape then leaves fullscreen before it leaves the book', () => {
    story(
      update,
      given({ ...openingModel(), isFullscreen: true }),
      ...opened(0),
      message(Message.PressedKey({ key: 'Escape' })),
      expectNoOutMessage(),
      Command.expectExact(ToggleFullscreen({ wantFullscreen: false })),
      Command.resolve(ToggleFullscreen, Message.CompletedToggleFullscreen()),
    )
  })

  test('escape with nothing left open goes back to the shelf', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.PressedKey({ key: 'Escape' })),
      expectOutMessage(OutMessage.RequestedExit()),
    )
  })
})
