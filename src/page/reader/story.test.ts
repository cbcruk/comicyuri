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
import {
  LoadSpread,
  LoadThumbs,
  MeasureThumbsWidth,
  PreloadNeighbours,
  ToggleFullscreen,
} from './command.ts'
import { SKIP_PAGES } from './constant.ts'
import { Message, OutMessage } from './message.ts'
import { DOUBLE_TAP_ZOOM, ORIGIN, ZOOM_MIN } from './gesture.ts'
import type { Point } from './gesture.ts'
import { Model, OpenState, SpreadState, init } from './model.ts'
import { NO_ROOM } from './scroll.ts'
import type { ScrollDevice } from './scroll.ts'
import { perRowFor } from './thumbs.ts'
import { update } from './update.ts'

const PAGE_COUNT = 6

/**
 * 크기를 재기 전에 들여온 책. 넓은 페이지 규칙에 걸리는 것이 없으므로 묶기는
 * 페이지 수만 따른다.
 */
const UNMEASURED: ReadonlyArray<Option.Option<number>> = Array.from({ length: PAGE_COUNT }, () =>
  Option.none(),
)

/** 아카이브 안의 파일 이름. 여섯 쪽이면 `page-01.png`부터 여섯 개다. */
const namesOf = (pageCount: number): ReadonlyArray<string> =>
  Array.from({ length: pageCount }, (_, page) => `page-${String(page + 1).padStart(2, '0')}.png`)

/** 책의 끝에서 이웃한 책으로 넘어가지 않고 제자리에 머무는 설정. */
const STOPS_AT_THE_END = { ...defaultSettings, atBookEnd: 'stop' } as const

/** 그 번호의 페이지만 가로로 넓은 책. 나머지는 인쇄된 만화 한 쪽의 비다. */
const wideAt = (...pages: number[]): ReadonlyArray<Option.Option<number>> =>
  Array.from({ length: PAGE_COUNT }, (_, page) => Option.some(pages.includes(page) ? 1.4 : 0.7))

const openingModel = (settings = defaultSettings): Model =>
  init({
    bookId: 'volume-1::42',
    page: 0,
    maybeResumePage: Option.none(),
    bookmarks: [],
    marks: [],
    rotation: 0,
    maybeBookSettings: Option.none(),
    settings,
  })

const acknowledgePreload = Command.resolve(PreloadNeighbours, Message.CompletedPreloadNeighbours())

/** 넘김이 요청한 로드에, 어느 페이지에 닿았든 답해 준다. */
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

/** 책을 열고 첫 스프레드까지 안정시킨다. 모든 테스트가 여기서 시작한다. */
const opened = (page: number, ratios: ReadonlyArray<Option.Option<number>> = UNMEASURED) => [
  message(
    Message.CompletedOpenBook({
      title: 'Volume 1',
      pageCount: PAGE_COUNT,
      ratios,
      names: namesOf(PAGE_COUNT),
    }),
  ),
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
  test('a book that opens shows its first spread without claiming that as progress', () => {
    // 받아 든 자리를 되받아 적으면 저장된 자리를 덮어쓴다. 리더는 스스로 옮긴
    // 자리만 보고한다.
    story(
      update,
      given(openingModel()),
      message(
        Message.CompletedOpenBook({
          title: 'Volume 1',
          pageCount: PAGE_COUNT,
          ratios: UNMEASURED,
          names: namesOf(PAGE_COUNT),
        }),
      ),
      expectNoOutMessage(),
      model((model) => {
        expect(model.openState).toStrictEqual(
          OpenState.Ready({
            title: 'Volume 1',
            pageCount: PAGE_COUNT,
            ratios: UNMEASURED,
            names: namesOf(PAGE_COUNT),
          }),
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
          marks: [],
          rotation: 0,
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

  test('turning past the last page asks for the book after this one', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedLast()),
      ...settle(PAGE_COUNT - 1),
      message(Message.ClickedNext()),
      expectOutMessage(OutMessage.RequestedNeighbourBook({ bookId: 'volume-1::42', step: 1 })),
      // 리더는 제자리에 머문다. 다른 책을 여는 것은 책장 순서를 아는 쪽의 일이다.
      model((model) => {
        expect(model.page).toBe(PAGE_COUNT - 1)
      }),
    )
  })

  test('turning back from the first page asks for the book before this one', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedPrevious()),
      expectOutMessage(OutMessage.RequestedNeighbourBook({ bookId: 'volume-1::42', step: -1 })),
    )
  })

  test('set to wrap, the end of the book leads back to its start', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, atBookEnd: 'wrap' })),
      ...opened(0),
      message(Message.ClickedLast()),
      ...settle(PAGE_COUNT - 1),
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 0, pages: [0] })),
      ...settle(0),
    )
  })

  test('previous on the first page stays put', () => {
    story(
      update,
      given(openingModel(STOPS_AT_THE_END)),
      ...opened(0),
      message(Message.ClickedPrevious()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.page).toBe(0)
      }),
    )
  })

  test('a spread that arrives after the reader moved on is discarded', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedNext()),
      // 0페이지에 대한 답이 늦게 도착한다.
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
  /** 건너뛰기가 끝에 닿지 않을 만큼 긴 책. */
  const LONG_PAGE_COUNT = 30

  const openedLongBook = (page: number) => [
    message(
      Message.CompletedOpenBook({
        title: 'Volume 1',
        pageCount: LONG_PAGE_COUNT,
        ratios: Array.from({ length: LONG_PAGE_COUNT }, () => Option.none<number>()),
        names: namesOf(LONG_PAGE_COUNT),
      }),
    ),
    Command.expectHas(LoadSpread({ page, pages: [page] })),
    Command.resolve(
      LoadSpread,
      Message.CompletedLoadSpread({ page, panels: [{ page, url: `blob:${page}` }] }),
    ),
    acknowledgePreload,
  ]

  test('in right-to-left reading the left key advances', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.PressedKey({ key: 'ArrowLeft', withShift: false })),
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
      message(Message.PressedKey({ key: 'ArrowLeft', withShift: false })),
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

  test('shift and a turn key skips a stretch of pages', () => {
    story(
      update,
      given(openingModel()),
      // 오른쪽에서 왼쪽으로 읽으므로 왼쪽이 앞이다.
      ...openedLongBook(0),
      message(Message.PressedKey({ key: 'ArrowLeft', withShift: true })),
      model((model) => {
        expect(model.page).toBe(SKIP_PAGES)
      }),
      ...settle(SKIP_PAGES),
      message(Message.PressedKey({ key: 'ArrowRight', withShift: true })),
      model((model) => {
        expect(model.page).toBe(0)
      }),
      ...settle(0),
    )
  })

  test('a skip stops at the ends of the book instead of leaving it', () => {
    story(
      update,
      given(openingModel()),
      ...openedLongBook(0),
      // 앞쪽으로는 갈 곳이 없다. 책 끝 동작은 넘김의 것이지 건너뛰기의 것이 아니다.
      message(Message.PressedKey({ key: 'ArrowRight', withShift: true })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.page).toBe(0)
      }),
      message(Message.PressedKey({ key: 'End', withShift: false })),
      ...settle(LONG_PAGE_COUNT - 1),
      message(Message.PressedKey({ key: 'ArrowLeft', withShift: true })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.page).toBe(LONG_PAGE_COUNT - 1)
      }),
    )
  })

  test('shift and space goes back, the way it always has', () => {
    story(
      update,
      given({ ...openingModel(), page: 3 }),
      ...opened(3),
      message(Message.PressedKey({ key: ' ', withShift: true })),
      model((model) => {
        expect(model.page).toBe(2)
      }),
      ...settle(2),
    )
  })

  test('escape asks the application to leave', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.PressedKey({ key: 'Escape', withShift: false })),
      expectOutMessage(OutMessage.RequestedExit()),
    )
  })

  test('an unbound key changes nothing', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.PressedKey({ key: 'q', withShift: false })),
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
          bookId: 'volume-1::42',
          settings: { ...defaultSettings, view: 'spread' },
        }),
      ),
      model((model) => {
        expect(model.settings.view).toBe('spread')
      }),
      // 표지는 혼자 있으므로 0페이지는 여전히 한 장짜리 스프레드다.
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

  test('a wide page is read on its own and the pairs after it stay in step', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, view: 'spread' })),
      ...opened(0, wideAt(3)),
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 1, pages: [1, 2] })),
      ...settle(1),
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 3, pages: [3] })),
      ...settle(3),
      // 넓은 페이지 하나가 그 뒤를 한 장씩 밀어내지 않는다.
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 4, pages: [4, 5] })),
      ...settle(4),
    )
  })

  test('the page before a wide one is read alone rather than paired across it', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, view: 'spread' })),
      ...opened(0, wideAt(2)),
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 1, pages: [1] })),
      ...settle(1),
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 2, pages: [2] })),
      ...settle(2),
    )
  })

  test('a book whose pages were never measured is paired the way it always was', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, view: 'spread' })),
      ...opened(0),
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 1, pages: [1, 2] })),
      ...settle(1),
    )
  })

  test('flipping the binding splits the spread being read, and saves it', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, view: 'spread' })),
      ...opened(0),
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 1, pages: [1, 2] })),
      ...settle(1),
      message(Message.ClickedToggleBinding()),
      Command.expectHas(LoadSpread({ page: 1, pages: [1] })),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 1,
          bookmarks: [],
          marks: [{ page: 1, binding: 'alone' }],
          rotation: 0,
        }),
      ),
      ...settle(1),
    )
  })

  test('flipping twice comes back to the spread it started from', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, view: 'spread' })),
      ...opened(0),
      message(Message.ClickedNext()),
      ...settle(1),
      message(Message.ClickedToggleBinding()),
      ...settle(1),
      message(Message.ClickedToggleBinding()),
      Command.expectHas(LoadSpread({ page: 1, pages: [1, 2] })),
      model((model) => {
        expect(model.marks).toStrictEqual([{ page: 1, binding: 'pair' }])
      }),
      ...settle(1),
    )
  })

  test('flipping binds a wide page back to its neighbour', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, view: 'spread' })),
      ...opened(0, wideAt(3)),
      message(Message.ClickedNext()),
      ...settle(1),
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 3, pages: [3] })),
      ...settle(3),
      // 손으로 건 표시가 자동 판정을 이긴다. 그러지 못하면 탈출구가 아니다.
      message(Message.ClickedToggleBinding()),
      Command.expectHas(LoadSpread({ page: 3, pages: [3, 4] })),
      ...settle(3),
    )
  })

  test('one-page mode has no binding to flip', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedToggleBinding()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.marks).toStrictEqual([])
      }),
    )
  })

  test('a book opens with the bindings it was left with', () => {
    story(
      update,
      given(
        init({
          bookId: 'volume-1::42',
          page: 0,
          maybeResumePage: Option.none(),
          bookmarks: [],
          marks: [{ page: 1, binding: 'alone' }],
          rotation: 0,
          maybeBookSettings: Option.none(),
          settings: { ...defaultSettings, view: 'spread' },
        }),
      ),
      message(
        Message.CompletedOpenBook({
          title: 'Volume 1',
          pageCount: PAGE_COUNT,
          ratios: UNMEASURED,
          names: namesOf(PAGE_COUNT),
        }),
      ),
      Command.expectHas(LoadSpread({ page: 0, pages: [0] })),
      ...settle(0),
      message(Message.ClickedNext()),
      Command.expectHas(LoadSpread({ page: 1, pages: [1] })),
      ...settle(1),
    )
  })

  test('the threshold stops at the ends of its range', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, singleThreshold: 0.98 })),
      ...opened(0),
      message(Message.ClickedNudgeThreshold({ by: 0.02 })),
      ...settle(0),
      message(Message.ClickedNudgeThreshold({ by: 0.02 })),
      expectOutMessage(
        OutMessage.ChangedSettings({
          bookId: 'volume-1::42',
          settings: { ...defaultSettings, singleThreshold: 1 },
        }),
      ),
      ...settle(0),
      model((model) => {
        expect(model.settings.singleThreshold).toBe(1)
      }),
    )
  })

  test('a setting picked in the panel lays the book out again at once', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, view: 'spread' })),
      ...opened(0),
      // 표지를 혼자 두지 않기로 하면 첫 화면부터 두 장이 된다.
      message(Message.ToggledCoverAlone({ isChecked: false })),
      Command.expectHas(LoadSpread({ page: 0, pages: [0, 1] })),
      ...settle(0),
    )
  })

  test('remembering for each book keeps the global defaults where they were', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, rememberBookSettings: true })),
      ...opened(0),
      message(Message.ClickedToggleDirection()),
      model((model) => {
        expect(model.settings.direction).toBe('ltr')
        // 이 책이 뒤집은 방향이 전역 기본값까지 뒤집어서는 안 된다.
        expect(model.globalSettings.direction).toBe('rtl')
      }),
      ...settle(0),
    )
  })

  test('turning remembering off puts the global defaults back', () => {
    story(
      update,
      given(openingModel({ ...defaultSettings, rememberBookSettings: true })),
      ...opened(0),
      message(Message.ClickedToggleDirection()),
      ...settle(0),
      message(Message.ToggledRememberBookSettings({ isChecked: false })),
      expectOutMessage(
        OutMessage.ChangedSettings({
          bookId: 'volume-1::42',
          settings: { ...defaultSettings, rememberBookSettings: false },
        }),
      ),
      ...settle(0),
    )
  })

  test('a book opens on what it remembered, not on the global defaults', () => {
    story(
      update,
      given(
        init({
          bookId: 'volume-1::42',
          page: 0,
          maybeResumePage: Option.none(),
          bookmarks: [],
          marks: [],
          rotation: 0,
          maybeBookSettings: Option.some({
            direction: 'ltr',
            view: 'spread',
            fit: 'width',
            coverAlone: false,
            singleThreshold: 0.8,
            enlargeToFit: true,
            splitWide: false,
          }),
          settings: { ...defaultSettings, rememberBookSettings: true },
        }),
      ),
      model((model) => {
        expect(model.settings.direction).toBe('ltr')
        expect(model.settings.view).toBe('spread')
        expect(model.globalSettings.direction).toBe('rtl')
      }),
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
      // 오른쪽에서 왼쪽으로 읽으므로 왼쪽 1/3이 앞으로 넘긴다.
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
      given(openingModel(STOPS_AT_THE_END)),
      ...opened(0),
      press(1, 0),
      move(1, -80),
      release(1, -80),
      model((model) => {
        // 오른쪽에서 왼쪽으로 읽으면 오른쪽 페이지가 이전 페이지인데, 0페이지에는
        // 그런 것이 없으므로 자리를 지킨다.
        expect(model.page).toBe(0)
      }),
    )
  })

  test('two fingers zoom, and lifting one leaves the other panning', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      press(1, -50),
      press(2, 50),
      // 손가락 사이 간격이 두 배가 되므로 배율도 두 배가 된다.
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
  test('the chrome stays up while nothing happens', () => {
    // 스스로 숨던 툴바는 넘김 키마다 되돌아와 읽는 사람을 지치게 했다. 이제 숨기는
    // 대기가 없으므로, 열린 리더는 사람이 숨기기 전까지 툴바를 띄워 둔다.
    story(
      update,
      given(openingModel()),
      ...opened(0),
      model((model) => {
        expect(model.isChromeVisible).toBe(true)
      }),
    )
  })

  test('the hide control takes the chrome down and brings it back', () => {
    story(
      update,
      given(openingModel()),
      message(Message.ClickedToggleChrome()),
      model((model) => {
        expect(model.isChromeVisible).toBe(false)
      }),
      message(Message.ClickedToggleChrome()),
      model((model) => {
        expect(model.isChromeVisible).toBe(true)
      }),
    )
  })

  test('the h key does what the hide control does', () => {
    story(
      update,
      given(openingModel()),
      message(Message.PressedKey({ key: 'h', withShift: false })),
      model((model) => {
        expect(model.isChromeVisible).toBe(false)
      }),
      message(Message.PressedKey({ key: 'h', withShift: false })),
      model((model) => {
        expect(model.isChromeVisible).toBe(true)
      }),
    )
  })

  test('a press leaves the chrome as it found it', () => {
    // 누르는 길에 보여 버리면 가운데 탭이 하나같이 '숨김'으로 끝난다. 놓는 쪽이
    // 누름이 남긴 상태에서 토글하기 때문이다.
    story(
      update,
      given({ ...openingModel(), isChromeVisible: false }),
      message(Message.PressedPointer({ pointerId: 1, at: { x: 0, y: 0 } })),
      model((model) => {
        expect(model.isChromeVisible).toBe(false)
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

  test('turning the page leaves hidden chrome hidden', () => {
    // 숨긴 사람은 페이지만 보려고 숨겼다. 넘길 때마다 툴바가 되돌아오면 숨긴 것이
    // 한 장을 넘기지 못한다.
    story(
      update,
      given({ ...openingModel(), isChromeVisible: false }),
      ...opened(0),
      message(Message.PressedKey({ key: 'ArrowLeft', withShift: false })),
      model((model) => {
        expect(model.page).toBe(1)
        expect(model.isChromeVisible).toBe(false)
      }),
      ...settle(1),
    )
  })

  test('using a control leaves the chrome where it is', () => {
    // 툴바가 내려가 있을 때 닿는 컨트롤은 키와 격자, 설정 패널이다. 그것들을 쓴다고
    // 툴바가 따라 나오지 않는다.
    story(
      update,
      given({ ...openingModel(), isChromeVisible: false }),
      message(Message.ClickedToggleSettings()),
      message(Message.ToggledCoverAlone({ isChecked: false })),
      model((model) => {
        expect(model.isSettingsOpen).toBe(true)
        expect(model.isChromeVisible).toBe(false)
      }),
    )
  })
})

describe('a gesture the browser never closed', () => {
  const press = (pointerId: number, x: number) =>
    message(Message.PressedPointer({ pointerId, at: { x, y: 0 } }))
  const move = (pointerId: number, x: number) =>
    message(Message.MovedPointer({ pointerId, at: { x, y: 0 } }))

  test('the same pointer pressing again restarts, it does not pinch', () => {
    // 누르는 도중에 창이 포커스를 잃으면 놓음이 끝내 오지 않을 수 있다. 뒤이은
    // 누름은 같은 포인터가 다시 시작하는 것인데, 그것을 두 번째 손가락으로 읽으면
    // 낡은 점과 새 점 사이를 재게 된다 — 탭으로 돌아와 클릭했을 때 배율이 끝까지
    // 튄 것이 이 때문이다.
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
    // 터치 포인터는 매번 새 id를 받으므로, 낡은 흐름과 새 누름은 거의 같은 자리에
    // 앉은 서로 다른 두 id가 된다. 그 간격이 늘어난 비율로 확대하면 거기서부터는
    // 끝이 없고, 탭으로 돌아와 클릭했을 때 배율이 한계까지 밀린 것이 이 때문이다.
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
      // 돌아와서 누르면 자기 배율 없이 깨끗하게 시작한다.
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

  test('a first middle tap moments after the page opens shows the chrome, not a zoom', () => {
    // `timeStamp`는 문서가 열린 순간부터 센다. 기다리는 탭이 없는 것을 `0`으로 적어 두었을
    // 때는 열리고 300ms 안의 첫 탭이 그 `0`과 짝지어져 확대가 되었다.
    story(
      update,
      given({ ...openingModel(), isChromeVisible: false }),
      ...opened(0),
      press(1, 0),
      release(1, 0, 120),
      model((model) => {
        expect(model.zoom).toBe(ZOOM_MIN)
        expect(model.isChromeVisible).toBe(true)
      }),
    )
  })

  test('two quick taps on a turning zone turn two pages', () => {
    // 트랙패드에서는 이것이 실수로도 쉽게 일어나고, 그 짝을 더블 탭으로 다루었기에
    // 빨리 읽던 사람의 페이지가 확대가 되었다.
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
        // 가운데 탭은 제 할 일을 했다.
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
      // 오른쪽에서 왼쪽으로 읽으므로 왼쪽 1/3이 앞으로 넘긴다.
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
        // 토큰이 바뀌어야 뷰가 애니메이션을 두 번 재생할 수 있다.
        expect(Option.map(model.maybeTapFlash, ({ token }) => token)).toStrictEqual(Option.some(1))
      }),
      ...settle(2),
    )
  })

  test('a tap at the end of the book marks nothing', () => {
    story(
      update,
      given(openingModel(STOPS_AT_THE_END)),
      ...opened(0),
      // 오른쪽 1/3은 뒤로 가는데, 1페이지에는 갈 곳이 없다.
      press(1, 250),
      release(1, 250),
      model((model) => {
        expect(model.maybeTapFlash).toStrictEqual(Option.none())
      }),
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
    // pan 오프셋은 떠나는 페이지를 기준으로 잰 값이라, 그대로 가져가면 다음
    // 페이지의 엉뚱한 곳에 앉는다.
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
      message(
        Message.ScrolledStage({
          delta: { x: 20, y: 50 },
          room: { up: 0, down: 300, left: 0, right: 300 },
          device: 'trackpad',
        }),
      ),
      model((model) => {
        // 아래로 스크롤하면 페이지는 위로 간다. 스크롤이 늘 그렇듯이.
        expect(model.pan).toStrictEqual({ x: -20, y: -50 })
      }),
    )
  })
})

describe('scrolling to the edge of the page', () => {
  const scrolled = (delta: Point, room = NO_ROOM, device: ScrollDevice = 'wheel') =>
    message(Message.ScrolledStage({ delta, room, device }))

  test('a page with nowhere left to go turns instead', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      scrolled({ x: 0, y: 50 }),
      model((model) => {
        expect(model.page).toBe(1)
      }),
      ...settle(1),
    )
  })

  test('the scroll that reaches the edge does not also turn the page', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      scrolled({ x: 0, y: 400 }, { up: 0, down: 100, left: 0, right: 0 }),
      model((model) => {
        expect(model.page).toBe(0)
        expect(model.pan).toStrictEqual({ x: 0, y: -100 })
      }),
    )
  })

  test('a trackpad stops at the edge instead of turning', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      scrolled({ x: 0, y: 50 }, NO_ROOM, 'trackpad'),
      scrolled({ x: 0, y: 50 }, NO_ROOM, 'trackpad'),
      model((model) => {
        expect(model.page).toBe(0)
      }),
    )
  })

  test('one notch turns one page, however many follow it', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      scrolled({ x: 0, y: 50 }),
      ...settle(1),
      scrolled({ x: 0, y: 50 }),
      model((model) => {
        expect(model.page).toBe(2)
      }),
      ...settle(2),
    )
  })

  test('scrolling back at the top enters the page before it at its end', () => {
    story(
      update,
      given({ ...openingModel(), page: 2 }),
      ...opened(2),
      scrolled({ x: 0, y: -50 }),
      model((model) => {
        expect(model.page).toBe(1)
        expect(model.entry).toBe('end')
      }),
      ...settle(1),
    )
  })

  test('a page entered forwards starts at its start', () => {
    story(
      update,
      given({ ...openingModel(), entry: 'end' }),
      ...opened(0),
      message(Message.ClickedNext()),
      model((model) => {
        expect(model.entry).toBe('start')
      }),
      ...settle(1),
    )
  })

  test('jumping is not turning, so a jump starts at the start', () => {
    story(
      update,
      given({ ...openingModel(), page: 3 }),
      ...opened(3),
      message(Message.SelectedThumb({ page: 1 })),
      model((model) => {
        expect(model.entry).toBe('start')
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
          marks: [],
          rotation: 0,
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

  test('the bracket keys step from one bookmark to the next and back', () => {
    story(
      update,
      given({ ...openingModel(), bookmarks: [1, 4] }),
      ...opened(0),
      message(Message.PressedKey({ key: ']', withShift: false })),
      model((model) => {
        expect(model.page).toBe(1)
      }),
      ...settle(1),
      message(Message.PressedKey({ key: ']', withShift: false })),
      model((model) => {
        expect(model.page).toBe(4)
      }),
      ...settle(4),
      message(Message.PressedKey({ key: '[', withShift: false })),
      model((model) => {
        expect(model.page).toBe(1)
      }),
      ...settle(1),
    )
  })

  test('with no bookmark left that way the page stays where it is', () => {
    story(
      update,
      given({ ...openingModel(), bookmarks: [1] }),
      ...opened(0),
      message(Message.PressedKey({ key: '[', withShift: false })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.page).toBe(0)
      }),
    )
  })

  test('a bookmark can be dropped from the list without going to its page', () => {
    story(
      update,
      given({ ...openingModel(), bookmarks: [1, 4] }),
      ...opened(0),
      message(Message.ClickedRemoveBookmark({ page: 4 })),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 0,
          bookmarks: [1],
          marks: [],
          rotation: 0,
        }),
      ),
      Command.resolve(LoadThumbs, Message.CompletedLoadThumbs({ panels: [] })),
      model((model) => {
        expect(model.bookmarks).toStrictEqual([1])
        // 목록을 손보는 것이지 읽던 자리를 옮기는 것이 아니다.
        expect(model.page).toBe(0)
      }),
    )
  })

  test('dropping the bookmark on the page being read leaves the reader there', () => {
    story(
      update,
      given({ ...openingModel(), bookmarks: [0] }),
      ...opened(0),
      message(Message.ClickedRemoveBookmark({ page: 0 })),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 0,
          bookmarks: [],
          marks: [],
          rotation: 0,
        }),
      ),
      Command.resolve(LoadThumbs, Message.CompletedLoadThumbs({ panels: [] })),
      model((model) => {
        expect(model.bookmarks).toStrictEqual([])
        expect(model.page).toBe(0)
      }),
    )
  })
})

describe('offering the saved position', () => {
  /** 41쪽에 멈춰 있던 책을, 물어보기로 한 사람이 연 상태. */
  const asked = (): Model => ({ ...openingModel(), maybeResumePage: Option.some(4) })

  test('taking the offer goes there and the question is done', () => {
    story(
      update,
      given(asked()),
      ...opened(0),
      message(Message.ClickedResume({ page: 4 })),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 4,
          bookmarks: [],
          marks: [],
          rotation: 0,
        }),
      ),
      model((model) => {
        expect(model.page).toBe(4)
        expect(model.maybeResumePage).toStrictEqual(Option.none())
      }),
      ...settle(4),
    )
  })

  test('turning it down leaves the reader where it opened', () => {
    story(
      update,
      given(asked()),
      ...opened(0),
      message(Message.ClickedDismissResume()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.page).toBe(0)
        expect(model.maybeResumePage).toStrictEqual(Option.none())
      }),
    )
  })

  test('reading on does not take the question away', () => {
    // 첫 장부터 읽기 시작해도 그 자리는 여전히 거기 있다.
    story(
      update,
      given(asked()),
      ...opened(0),
      message(Message.ClickedNext()),
      ...settle(1),
      model((model) => {
        expect(model.maybeResumePage).toStrictEqual(Option.some(4))
      }),
    )
  })
})

describe('going to a page by number', () => {
  test('a number in the book goes there', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.SubmittedGoToPage({ text: '4' })),
      model((model) => {
        expect(model.page).toBe(3)
      }),
      ...settle(3),
    )
  })

  test('a number outside the book, or no number at all, changes nothing', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.SubmittedGoToPage({ text: '99' })),
      message(Message.SubmittedGoToPage({ text: '0' })),
      message(Message.SubmittedGoToPage({ text: 'seven' })),
      message(Message.SubmittedGoToPage({ text: '' })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.page).toBe(0)
      }),
    )
  })
})

describe('turning onto a page that is not ready yet', () => {
  /** 0페이지가 화면에 걸린 리더. */
  const onPage0 = (): Model => {
    const opening = update(
      openingModel(),
      Message.CompletedOpenBook({
        title: 'Volume 1',
        pageCount: PAGE_COUNT,
        ratios: UNMEASURED,
        names: namesOf(PAGE_COUNT),
      }),
    ).model
    return update(
      opening,
      Message.CompletedLoadSpread({ page: 0, panels: [{ page: 0, url: 'blob:0' }] }),
    ).model
  }

  test('the page on screen stays until the next one can be drawn', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedNext()),
      model((model) => {
        expect(model.page).toBe(1)
        expect(model.spread).toStrictEqual(
          SpreadState.Loading({
            maybeOnScreen: Option.some({
              page: 0,
              panels: [{ page: 0, url: 'blob:0' }],
              entry: 'start',
              half: 'first',
              zoom: ZOOM_MIN,
              pan: ORIGIN,
            }),
          }),
        )
      }),
      ...settle(1),
      model((model) => {
        expect(model.spread).toStrictEqual(
          SpreadState.Shown({ panels: [{ page: 1, url: 'blob:1' }] }),
        )
      }),
    )
  })

  test('it keeps what it drew with, not what the next page will use', () => {
    // 뒤로 넘기면 Model의 `entry`는 그 순간 `end`가 된다. 이전 페이지는 들어선 그대로
    // 남아야 한다.
    story(
      update,
      given({ ...openingModel(), page: 3 }),
      ...opened(3),
      message(Message.ClickedPrevious()),
      model((model) => {
        expect(model.entry).toBe('end')
        expect(model.spread).toMatchObject({
          _tag: 'Loading',
          maybeOnScreen: Option.some({ page: 3, entry: 'start' }),
        })
      }),
      ...settle(2),
    )
  })

  test('a zoomed page stays zoomed until the next one can be drawn', () => {
    // 넘기면 Model의 배율은 곧바로 풀린다. 이전 페이지는 확대해 둔 그대로 남아야 한다.
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedZoomIn()),
      message(Message.ClickedNext()),
      model((model) => {
        expect(model.zoom).toBe(ZOOM_MIN)
        expect(model.spread).toMatchObject({
          _tag: 'Loading',
          maybeOnScreen: Option.some({ page: 0, zoom: 1.25, pan: ORIGIN }),
        })
      }),
      ...settle(1),
    )
  })

  test('a scroll before it arrives does not move the page on its way', () => {
    // 확대해 둔 이전 페이지에는 굴릴 거리가 있다. 그 거리로 굴리면 확대하지 않은
    // 다음 페이지가 엉뚱한 자리에 앉는다.
    const zoomed = update(onPage0(), Message.ClickedZoomIn()).model
    const turned = update(zoomed, Message.ClickedNext()).model
    const scrolled = update(
      turned,
      Message.ScrolledStage({
        delta: { x: 0, y: 50 },
        room: { up: 0, down: 300, left: 0, right: 0 },
        device: 'trackpad',
      }),
    ).model

    expect(scrolled.pan).toStrictEqual(ORIGIN)
  })

  test('turning again before it arrives keeps the page that is still on screen', () => {
    // 첫 넘김의 답이 오기 전에 다시 넘긴다. 화면에는 여전히 0페이지가 걸려 있다.
    // story는 답하지 않은 Command를 둔 채 다음 Message를 보낼 수 없어서 update를 직접
    // 부른다.
    const first = update(onPage0(), Message.ClickedNext()).model
    const second = update(first, Message.ClickedNext()).model

    expect(second.page).toBe(2)
    expect(second.spread).toMatchObject({
      _tag: 'Loading',
      maybeOnScreen: Option.some({ page: 0 }),
    })
  })

  test('a jump holds on to the page on screen instead of releasing it', () => {
    // 멀리 건너뛰면 떠난 페이지는 쥘 만한 범위 밖이다. 그래도 새 페이지가 설 때까지는
    // 화면에 걸려 있으므로 그 URL을 놓지 않는다.
    const shown = update(
      openingModel(),
      Message.CompletedOpenBook({
        title: 'Volume 1',
        pageCount: PAGE_COUNT,
        ratios: UNMEASURED,
        names: namesOf(PAGE_COUNT),
      }),
    ).model
    const onPage0 = update(
      shown,
      Message.CompletedLoadSpread({ page: 0, panels: [{ page: 0, url: 'blob:0' }] }),
    ).model
    const jumped = update(onPage0, Message.ClickedLast())
    const preload = jumped.commands?.find((command) => command.name === 'PreloadNeighbours')

    expect(preload).toMatchObject({ args: { keep: expect.arrayContaining([0]) } })
  })
})

describe('the slideshow', () => {
  test('each turn of the wait moves a page on', () => {
    story(
      update,
      given({ ...openingModel(), isPlaying: true }),
      ...opened(0),
      message(Message.ElapsedSlide()),
      model((model) => {
        expect(model.page).toBe(1)
        expect(model.isPlaying).toBe(true)
      }),
      ...settle(1),
    )
  })

  test('it stops itself where it can go no further', () => {
    story(
      update,
      given({
        ...openingModel(STOPS_AT_THE_END),
        page: PAGE_COUNT - 1,
        isPlaying: true,
      }),
      ...opened(PAGE_COUNT - 1),
      message(Message.ElapsedSlide()),
      model((model) => {
        expect(model.page).toBe(PAGE_COUNT - 1)
        expect(model.isPlaying).toBe(false)
      }),
    )
  })

  test('a wide page read in halves gives each half a turn of the wait', () => {
    story(
      update,
      given({ ...openingModel({ ...defaultSettings, splitWide: true }), page: 3, isPlaying: true }),
      ...opened(3, wideAt(3)),
      message(Message.ElapsedSlide()),
      model((model) => {
        expect(model.page).toBe(3)
        expect(model.half).toBe('second')
        expect(model.isPlaying).toBe(true)
      }),
      message(Message.ElapsedSlide()),
      model((model) => {
        expect(model.page).toBe(4)
        expect(model.isPlaying).toBe(true)
      }),
      ...settle(4),
    )
  })

  test('escape stops it before it leaves anything else', () => {
    story(
      update,
      given({ ...openingModel(), isPlaying: true, isFullscreen: true }),
      ...opened(0),
      message(Message.PressedKey({ key: 'Escape', withShift: false })),
      model((model) => {
        expect(model.isPlaying).toBe(false)
        expect(model.isFullscreen).toBe(true)
      }),
    )
  })

  test('starting it takes the chrome down, so only the page is left', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedToggleSlideshow()),
      model((model) => {
        expect(model.isPlaying).toBe(true)
        expect(model.isChromeVisible).toBe(false)
      }),
    )
  })

  test('stopping it leaves the chrome down', () => {
    // 슬라이드쇼 전에 손으로 숨겨 두었을 수도 있다. 되부르는 것은 `h` 키와 가운데
    // 탭의 몫이다.
    story(
      update,
      given({ ...openingModel(), isPlaying: true, isChromeVisible: false }),
      ...opened(0),
      message(Message.ClickedToggleSlideshow()),
      model((model) => {
        expect(model.isPlaying).toBe(false)
        expect(model.isChromeVisible).toBe(false)
      }),
    )
  })
})

describe('reading a wide page in halves', () => {
  const SPLITTING = { ...defaultSettings, splitWide: true }

  test('the second half comes before the next page, and needs no new image', () => {
    story(
      update,
      given({ ...openingModel(SPLITTING), page: 3 }),
      ...opened(3, wideAt(3)),
      model((model) => {
        expect(model.half).toBe('first')
      }),
      message(Message.ClickedNext()),
      model((model) => {
        expect(model.page).toBe(3)
        expect(model.half).toBe('second')
      }),
      message(Message.ClickedNext()),
      model((model) => {
        expect(model.page).toBe(4)
        expect(model.half).toBe('first')
      }),
      ...settle(4),
    )
  })

  test('stepping back into a wide page lands on the half read last', () => {
    story(
      update,
      given({ ...openingModel(SPLITTING), page: 4 }),
      ...opened(4, wideAt(3)),
      message(Message.ClickedPrevious()),
      model((model) => {
        expect(model.page).toBe(3)
        expect(model.half).toBe('second')
      }),
      ...settle(3),
      message(Message.ClickedPrevious()),
      model((model) => {
        expect(model.page).toBe(3)
        expect(model.half).toBe('first')
      }),
    )
  })

  test('a page that is not wide is one step, however the setting is set', () => {
    story(
      update,
      given({ ...openingModel(SPLITTING), page: 1 }),
      ...opened(1, wideAt(3)),
      message(Message.ClickedNext()),
      model((model) => {
        expect(model.page).toBe(2)
      }),
      ...settle(2),
    )
  })

  test('with the setting off a wide page is one step too', () => {
    story(
      update,
      given({ ...openingModel(), page: 3 }),
      ...opened(3, wideAt(3)),
      message(Message.ClickedNext()),
      model((model) => {
        expect(model.page).toBe(4)
      }),
      ...settle(4),
    )
  })
})

describe('turning the page upright', () => {
  test('rotating reports the new angle with the position', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedRotate()),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 0,
          bookmarks: [],
          marks: [],
          rotation: 90,
        }),
      ),
      model((model) => {
        expect(model.rotation).toBe(90)
      }),
      ...settle(0),
    )
  })

  test('rotating leaves the page and the zoom where they were', () => {
    story(
      update,
      given({ ...openingModel(), page: 2, zoom: 3 }),
      ...opened(2),
      message(Message.ClickedRotate()),
      model((model) => {
        expect(model.page).toBe(2)
        expect(model.zoom).toBe(3)
      }),
      ...settle(2),
    )
  })

  test('a book opens at the angle it was left at', () => {
    story(
      update,
      given(
        init({
          bookId: 'volume-1::42',
          page: 0,
          maybeResumePage: Option.none(),
          bookmarks: [],
          marks: [],
          rotation: 270,
          maybeBookSettings: Option.none(),
          settings: defaultSettings,
        }),
      ),
      ...opened(0),
      model((model) => {
        expect(model.rotation).toBe(270)
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
        // 요청은 들어감이 아니다. document가 아직 그렇다고 말하지 않았다.
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
      // 격자를 열면 폭부터 묻는다. 몇 칸이 서는지가 무엇을 뽑을지도 정한다.
      Command.expectHas(MeasureThumbsWidth()),
      Command.resolve(MeasureThumbsWidth, Message.MeasuredThumbsWidth({ width: 1280 })),
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

  test('a wider window stands more thumbnails in a row, a narrow one fewer', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedToggleThumbs()),
      Command.resolve(MeasureThumbsWidth, Message.MeasuredThumbsWidth({ width: 1680 })),
      Command.resolve(LoadThumbs, Message.CompletedLoadThumbs({ panels: [] })),
      model((wide) => {
        expect(perRowFor(wide.thumbsWidth)).toBe(14)
      }),
      // 창이 줄면 서 있던 칸도 줄어든다.
      message(Message.MeasuredThumbsWidth({ width: 390 })),
      Command.resolve(LoadThumbs, Message.CompletedLoadThumbs({ panels: [] })),
      model((narrow) => {
        expect(perRowFor(narrow.thumbsWidth)).toBe(3)
      }),
    )
  })

  test('however narrow the window, the grid never falls to a single column', () => {
    story(
      update,
      given(openingModel()),
      ...opened(0),
      message(Message.ClickedToggleThumbs()),
      Command.resolve(MeasureThumbsWidth, Message.MeasuredThumbsWidth({ width: 120 })),
      Command.resolve(LoadThumbs, Message.CompletedLoadThumbs({ panels: [] })),
      model((model) => {
        expect(perRowFor(model.thumbsWidth)).toBe(2)
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
        // 격자가 사라졌으므로 그 썸네일들은 놓아 주어도 된다.
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
          // 5페이지는 읽는 자리 근처가 아니지만 격자가 그것을 보여 주고 있다.
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
      message(Message.PressedKey({ key: 'Escape', withShift: false })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.isThumbsOpen).toBe(false)
        expect(model.isFullscreen).toBe(true)
      }),
    )
  })

  test('escape closes the settings panel before anything else', () => {
    story(
      update,
      given({ ...openingModel(), isSettingsOpen: true, isThumbsOpen: true, isFullscreen: true }),
      ...opened(0),
      message(Message.PressedKey({ key: 'Escape', withShift: false })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.isSettingsOpen).toBe(false)
        expect(model.isThumbsOpen).toBe(true)
        expect(model.isFullscreen).toBe(true)
      }),
    )
  })

  test('escape then leaves fullscreen before it leaves the book', () => {
    story(
      update,
      given({ ...openingModel(), isFullscreen: true }),
      ...opened(0),
      message(Message.PressedKey({ key: 'Escape', withShift: false })),
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
      message(Message.PressedKey({ key: 'Escape', withShift: false })),
      expectOutMessage(OutMessage.RequestedExit()),
    )
  })
})
