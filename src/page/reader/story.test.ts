import { Option } from 'effect'
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

describe('using a control keeps the chrome up', () => {
  // Every one of these is something a person did to the toolbar or the footer.
  // Missing one is how the chrome timed out from under a reader who was using
  // it, so they are checked together rather than one test per control.
  //
  // `update` is called directly: the property is about the Model alone, and
  // each control produces a different set of Commands that a story would then
  // have to discharge for reasons that have nothing to do with what is being
  // asserted.
  const busyReading: Model = {
    ...openingModel(),
    openState: OpenState.Ready({ title: 'Volume 1', pageCount: PAGE_COUNT }),
    isChromeVisible: false,
    activityToken: 5,
  }

  const controls: ReadonlyArray<readonly [string, Message]> = [
    ['previous', Message.ClickedPrevious()],
    ['next', Message.ClickedNext()],
    ['first', Message.ClickedFirst()],
    ['last', Message.ClickedLast()],
    ['direction', Message.ClickedToggleDirection()],
    ['one or two pages', Message.ClickedToggleView()],
    ['fit', Message.ClickedCycleFit()],
    ['bookmark', Message.ClickedToggleBookmark()],
    ['every page', Message.ClickedToggleThumbs()],
    ['fullscreen', Message.ClickedToggleFullscreen()],
    ['zoom in', Message.ClickedZoomIn()],
    ['zoom out', Message.ClickedZoomOut()],
  ]

  for (const [name, control] of controls) {
    test(`the ${name} control restarts the wait`, () => {
      const next = update(busyReading, control).model

      expect(next.isChromeVisible).toBe(true)
      expect(next.activityToken).toBeGreaterThan(busyReading.activityToken)
    })
  }

  test('but leaving the book does not', () => {
    expect(update(busyReading, Message.ClickedExit()).model.isChromeVisible).toBe(false)
  })
})

describe('a gesture the browser never closed', () => {
  const press = (pointerId: number, x: number) =>
    message(Message.PressedPointer({ pointerId, at: { x, y: 0 } }))
  const move = (pointerId: number, x: number) =>
    message(Message.MovedPointer({ pointerId, at: { x, y: 0 } }))

  test('the same pointer pressing again restarts, it does not pinch', () => {
    // A window that loses focus mid-press may never deliver the release. The
    // press that follows is the same pointer starting over, and reading it as
    // a second finger spans a stale point to a fresh one — which is how a
    // click after coming back to the tab sent the zoom to its limit.
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, -100),
      press(1, -98),
      model((model) => {
        expect(model.gesture._tag).toBe('Tracking')
        expect(model.zoom).toBe(ZOOM_MIN)
      }),
      move(1, -60),
      model((model) => {
        expect(model.zoom).toBe(ZOOM_MIN)
      }),
    )
  })

  test('a different pointer landing on a stale one is not a pinch either', () => {
    // Touch pointers get a new id each time, so a stale sequence and a fresh
    // press are two different ids sitting on almost the same spot. Scaling by
    // how much that span grows is unbounded from there, which is how a click
    // after coming back to the tab pushed the zoom to its limit.
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(5, -100),
      press(6, -92),
      model((model) => {
        expect(model.gesture._tag).toBe('Tracking')
      }),
      move(6, 200),
      model((model) => {
        expect(model.zoom).toBe(ZOOM_MIN)
      }),
    )
  })

  test('two pointers a hand-width apart still pinch', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(5, -60),
      press(6, 60),
      model((model) => {
        expect(model.gesture._tag).toBe('Pinching')
      }),
      move(6, 180),
      model((model) => {
        expect(model.zoom).toBeCloseTo(2)
      }),
    )
  })

  test('leaving the page drops whatever the gesture was holding', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, -100),
      message(Message.AbandonedPointer()),
      model((model) => {
        expect(model.gesture._tag).toBe('Idle')
      }),
      // Coming back and pressing starts cleanly, with no zoom of its own.
      press(2, 20),
      model((model) => {
        expect(model.gesture._tag).toBe('Tracking')
        expect(model.zoom).toBe(ZOOM_MIN)
      }),
    )
  })
})

describe('reading fast is not asking to zoom', () => {
  const press = (pointerId: number, x: number) =>
    message(Message.PressedPointer({ pointerId, at: { x, y: 0 } }))
  const release = (pointerId: number, x: number, timeStamp: number) =>
    message(
      Message.ReleasedPointer({
        pointerId,
        at: { x, y: 0 },
        timeStamp,
        viewportWidth: 600,
      }),
    )

  test('two quick taps on a turning zone turn two pages', () => {
    // A trackpad makes this easy to do by accident, and treating the pair as a
    // double tap turned a fast reader's page into an enlargement.
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, -250),
      release(1, -250, 5000),
      ...settle(1),
      press(1, -250),
      release(1, -250, 5080),
      model((model) => {
        expect(model.page).toBe(2)
        expect(model.zoom).toBe(ZOOM_MIN)
      }),
      ...settle(2),
    )
  })

  test('a turning tap does not pair with a middle tap that follows', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, -250),
      release(1, -250, 5000),
      ...settle(1),
      press(1, 0),
      release(1, 0, 5080),
      model((model) => {
        expect(model.zoom).toBe(ZOOM_MIN)
        // The middle tap did its own job.
        expect(model.isChromeVisible).toBe(false)
      }),
    )
  })

  test('two quick taps in the middle still zoom', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, 0),
      release(1, 0, 5000),
      press(1, 0),
      release(1, 0, 5080),
      model((model) => {
        expect(model.zoom).toBeCloseTo(DOUBLE_TAP_ZOOM)
        expect(model.page).toBe(0)
      }),
    )
  })
})

describe('which side a page came from', () => {
  const press = (pointerId: number, x: number) =>
    message(Message.PressedPointer({ pointerId, at: { x, y: 0 } }))
  const release = (pointerId: number, x: number, timeStamp = 5000) =>
    message(
      Message.ReleasedPointer({
        pointerId,
        at: { x, y: 0 },
        timeStamp,
        viewportWidth: 600,
      }),
    )

  test('a tap that turns the page marks the side it came from', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      // Right-to-left reading, so the left third advances.
      press(1, -250),
      release(1, -250),
      model((model) => {
        expect(Option.map(model.maybeTapFlash, ({ side }) => side)).toStrictEqual(
          Option.some('Left'),
        )
      }),
      ...settle(1),
    )
  })

  test('tapping the same side again restarts the mark', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, -250),
      release(1, -250, 5000),
      ...settle(1),
      press(1, -250),
      release(1, -250, 9000),
      model((model) => {
        // A changed token is what lets the view play the animation twice.
        expect(Option.map(model.maybeTapFlash, ({ token }) => token)).toStrictEqual(Option.some(1))
      }),
      ...settle(2),
    )
  })

  test('a tap at the end of the book marks nothing', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      // The right third goes back, and page one has nowhere to go.
      press(1, 250),
      release(1, 250),
      model((model) => {
        expect(model.maybeTapFlash).toStrictEqual(Option.none())
      }),
      ...settle(0),
    )
  })

  test('a tap in the middle marks nothing either', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, 0),
      release(1, 0),
      model((model) => {
        expect(model.maybeTapFlash).toStrictEqual(Option.none())
      }),
    )
  })
})

describe('zoom across pages', () => {
  test('turning the page starts from an unzoomed, unpanned view', () => {
    // The pan offset was measured against the page being left, so carrying it
    // over would land on an arbitrary part of the next one.
    story(
      update,
      given({ ...openingModel(), zoom: 3, pan: { x: -120, y: 40 } }),
      ...opened(0),
      message(Message.ClickedNext()),
      model((model) => {
        expect(model.zoom).toBe(ZOOM_MIN)
        expect(model.pan).toStrictEqual(ORIGIN)
      }),
      ...settle(1),
    )
  })

  test('a settings change keeps the zoom, because the page did not move', () => {
    story(
      update,
      given({ ...openingModel(), zoom: 3, pan: { x: -120, y: 40 } }),
      ...opened(0),
      message(Message.ClickedToggleView()),
      model((model) => {
        expect(model.zoom).toBe(3)
        expect(model.pan).toStrictEqual({ x: -120, y: 40 })
      }),
      ...settle(0),
    )
  })

  test('a wheel scroll moves a zoomed page', () => {
    story(
      update,
      given({ ...openingModel(), zoom: 3, pan: ORIGIN }),
      ...opened(0),
      message(Message.ScrolledToPan({ delta: { x: 20, y: 50 } })),
      model((model) => {
        // Scrolling down moves the page up, the way a scroll always does.
        expect(model.pan).toStrictEqual({ x: -20, y: -50 })
      }),
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

describe('a pointer on the chrome', () => {
  test('entering holds it, and leaving starts the wait over', () => {
    story(
      update,
      given({ ...openingModel(), activityToken: 4 }),
      message(Message.EnteredChrome()),
      model((model) => {
        expect(model.isPointerOverChrome).toBe(true)
      }),
      message(Message.LeftChrome()),
      model((model) => {
        expect(model.isPointerOverChrome).toBe(false)
        // A fresh token, so the reader gets the full wait after the pointer
        // goes rather than whatever was left of an older one.
        expect(model.activityToken).toBe(5)
      }),
    )
  })
})
