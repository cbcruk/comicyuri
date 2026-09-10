import { Option } from 'effect'
import {
  Command,
  click,
  expect,
  expectOutMessage,
  given,
  keydown,
  role,
  scene,
  selector,
  within,
  text,
} from 'foldkit/scene'
import { describe, test } from 'vite-plus/test'

import { defaultSettings } from '../../types.ts'
import { LoadSpread, LoadThumbs, PreloadNeighbours } from './command.ts'
import { Slider, VirtualList } from '@foldkit/ui'

import { SLIDER_ID, THUMBS_ID, THUMB_ROW_HEIGHT } from './constant.ts'
import { Message, OutMessage } from './message.ts'
import { ORIGIN, ZOOM_MIN } from './gesture.ts'
import { Gesture, Model, OpenState, SpreadState } from './model.ts'
import { update } from './update.ts'
import { view } from './view.ts'

const program = { update, view }

/**
 * 격자는 컨테이너에 자리가 나는 만큼의 행을 그리는데, 테스트에서는 아무도 그
 * 컨테이너를 잰 적이 없다. 그래서 잰 값을 여기서 넣어 준다.
 */
const measuredThumbs = (model: Model): Model => ({
  ...model,
  isThumbsOpen: true,
  thumbs: {
    ...model.thumbs,
    measurement: { _tag: 'Measured', containerHeight: 600 },
  },
})

/** 크기를 재기 전에 들여온 책. 묶기는 페이지 수만 따른다. */
const UNMEASURED: ReadonlyArray<Option.Option<number>> = Array.from({ length: 6 }, () =>
  Option.none(),
)

const readingModel = (page = 0, settings = defaultSettings): Model => ({
  bookId: 'volume-1::42',
  openState: OpenState.Ready({ title: 'Volume 1', pageCount: 6, ratios: UNMEASURED }),
  spread: SpreadState.Shown({ panels: [{ page, url: `blob:${page}` }] }),
  page,
  bookmarks: [],
  marks: [],
  settings,
  globalSettings: settings,
  zoom: ZOOM_MIN,
  pan: ORIGIN,
  gesture: Gesture.Idle(),
  entry: 'start',
  isChromeVisible: true,
  isPointerOverChrome: false,
  activityToken: 0,
  lastTapAt: 0,
  maybeTapFlash: Option.none(),
  slider: Slider.init({ id: SLIDER_ID, min: 0, max: 5, step: 1 }),
  isFullscreen: false,
  isSettingsOpen: false,
  isThumbsOpen: false,
  showsBookmarksOnly: false,
  thumbs: VirtualList.init({ id: THUMBS_ID, rowHeightPx: THUMB_ROW_HEIGHT }),
  thumbPanels: [],
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

describe('the stage', () => {
  test('the page cannot be dragged away from under the gesture', () => {
    // 이미지를 끌기 시작하면 브라우저가 포인터 이벤트를 거두어 간다. 그러면 스와이프가
    // 첫 움직임 뒤에 잘린다.
    scene(
      program,
      given(readingModel()),
      expect(role('img', { name: 'Page 1' })).toHaveAttr('draggable', 'false'),
    )
  })

  test('the box the pages sit in fills the stage', () => {
    // 맞춤 모드는 페이지에 퍼센트 크기를 건다. 이 상자가 내용만큼만 커지면 페이지가
    // 자기 크기를 기준으로 자기를 재는 꼴이라 어떤 맞춤 모드도 듣지 않는다.
    scene(
      program,
      given(readingModel()),
      expect(within(selector('#reader-stage'), selector('.h-full'))).toHaveClass('w-full'),
    )
  })

  test('a page taller than the screen hangs off the end it was entered from', () => {
    // 교차축의 시작을 뒤집는 것이 곧 넘치는 페이지가 붙는 자리를 뒤집는 것이다.
    scene(
      program,
      given(readingModel()),
      expect(selector('#reader-page')).toHaveClass('items-center-safe'),
      expect(selector('#reader-page')).not.toHaveClass('flex-wrap-reverse'),
    )

    scene(
      program,
      given({ ...readingModel(), entry: 'end' as const }),
      expect(selector('#reader-page')).toHaveClass('flex-wrap-reverse'),
    )
  })
})

describe('which side a page came from', () => {
  // 표시는 `import.meta.hot`이 있는 곳에서만 그려지고, 테스트 실행이 그런 곳이다.
  // 프로덕션 빌드에서는 사라지므로, 이 테스트가 덮는 것은 개발 환경의 동작이다.
  test('a recorded turn draws the edge it came from', () => {
    scene(
      program,
      given({
        ...readingModel(),
        maybeTapFlash: Option.some({ side: 'Left' as const, token: 0 }),
      }),
      expect(selector('.tap-flash')).toExist(),
    )
  })

  test('nothing is drawn until a turn records one', () => {
    scene(program, given(readingModel()), expect(selector('.tap-flash')).not.toExist())
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
          bookId: 'volume-1::42',
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
          bookId: 'volume-1::42',
          settings: { ...defaultSettings, fit: 'width' },
        }),
      ),
      ...settleTurn(0),
      expect(role('button', { name: 'Change how pages are fitted' })).toContainText('Width'),
    )
  })

  test('the binding control is only there when there is a binding to flip', () => {
    const flip = role('button', { name: 'Flip how this spread is paired' })

    scene(program, given(readingModel()), expect(flip).not.toExist())
    scene(
      program,
      given(readingModel(0, { ...defaultSettings, view: 'spread' })),
      expect(flip).toExist(),
    )
  })
})

describe('the bookmark list', () => {
  const bookmarksOnly = (model: Model): Model => ({ ...model, showsBookmarksOnly: true })

  test('the grid can be narrowed to what is bookmarked', () => {
    scene(
      program,
      given(measuredThumbs({ ...readingModel(), bookmarks: [1, 3] })),
      expect(role('button', { name: 'Go to page 2' })).toExist(),
      expect(role('button', { name: 'Go to page 5' })).toExist(),
      click(role('button', { name: 'Show bookmarks only' })),
      Command.resolve(
        LoadThumbs,
        Message.CompletedLoadThumbs({
          panels: [
            { page: 1, url: 'blob:t1' },
            { page: 3, url: 'blob:t3' },
          ],
        }),
      ),
      expect(role('button', { name: 'Go to page 2' })).toExist(),
      expect(role('button', { name: 'Go to page 5' })).not.toExist(),
    )
  })

  test('a book with nothing bookmarked says so instead of showing an empty grid', () => {
    scene(
      program,
      given(bookmarksOnly(measuredThumbs(readingModel()))),
      expect(text('Nothing is bookmarked in this book yet')).toExist(),
    )
  })
})

describe('the settings panel', () => {
  const open = role('button', { name: 'Reading settings' })
  const panel = role('dialog', { name: 'Reading settings' })

  test('the panel is closed until the control opens it', () => {
    scene(
      program,
      given(readingModel()),
      expect(panel).not.toExist(),
      expect(open).toHaveAttr('aria-expanded', 'false'),
    )
  })

  test('the settings that have no toolbar button live here', () => {
    scene(
      program,
      given({ ...readingModel(), isSettingsOpen: true }),
      expect(panel).toExist(),
      expect(role('switch', { name: 'Cover on its own' })).toBeChecked(),
      expect(text('0.74')).toExist(),
      expect(role('button', { name: 'Next book' })).toHaveAttr('aria-pressed', 'true'),
      expect(role('button', { name: 'Stay put' })).toHaveAttr('aria-pressed', 'false'),
    )
  })

  test('turning the cover rule off reports the new settings', () => {
    scene(
      program,
      given({ ...readingModel(), isSettingsOpen: true }),
      click(role('switch', { name: 'Cover on its own' })),
      expectOutMessage(
        OutMessage.ChangedSettings({
          bookId: 'volume-1::42',
          settings: { ...defaultSettings, coverAlone: false },
        }),
      ),
      ...settleTurn(0),
    )
  })

  test('picking what happens at the end of a book reports it', () => {
    scene(
      program,
      given({ ...readingModel(), isSettingsOpen: true }),
      click(role('button', { name: 'Stay put' })),
      expectOutMessage(
        OutMessage.ChangedSettings({
          bookId: 'volume-1::42',
          settings: { ...defaultSettings, atBookEnd: 'stop' },
        }),
      ),
      ...settleTurn(0),
    )
  })

  test('nudging the threshold moves it one step, not to a long decimal', () => {
    scene(
      program,
      given({ ...readingModel(), isSettingsOpen: true }),
      click(role('button', { name: 'Pair fewer pages' })),
      expectOutMessage(
        OutMessage.ChangedSettings({
          bookId: 'volume-1::42',
          settings: { ...defaultSettings, singleThreshold: 0.76 },
        }),
      ),
      ...settleTurn(0),
      expect(text('0.76')).toExist(),
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

describe('page slider', () => {
  const slider = role('slider', { name: 'Page' })

  test('reading right to left, the slider starts full and empties leftward', () => {
    // 여섯 페이지라서 1페이지가 오른쪽 끝에 앉는다. 라벨은 여전히 페이지를
    // 부르는데, 페이지 번호는 뒤집히지 않기 때문이다.
    scene(
      program,
      given(readingModel()),
      expect(slider).toHaveAttr('aria-valuenow', '5'),
      expect(slider).toHaveAttr('aria-valuetext', 'Page 1'),
      keydown(slider, 'ArrowLeft'),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 1,
          bookmarks: [],
          marks: [],
        }),
      ),
      ...settleTurn(1),
      expect(slider).toHaveAttr('aria-valuenow', '4'),
      expect(slider).toHaveAttr('aria-valuetext', 'Page 2'),
    )
  })

  test('reading left to right, it runs the usual way', () => {
    scene(
      program,
      given(readingModel(0, { ...defaultSettings, direction: 'ltr' })),
      expect(slider).toHaveAttr('aria-valuenow', '0'),
      keydown(slider, 'ArrowRight'),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 1,
          bookmarks: [],
          marks: [],
        }),
      ),
      ...settleTurn(1),
      expect(slider).toHaveAttr('aria-valuenow', '1'),
    )
  })

  const track = selector('[data-slider-track-id]')
  // 채움은 트랙의 유일한 자식이고, 높이가 둘을 갈라 준다.
  const filled = within(track, selector('.h-full'))

  test('reading right to left, the filled part of the track sits on the right', () => {
    // 컴포넌트는 자기 최솟값, 그러니까 왼쪽부터 채운다. 오른쪽에서 왼쪽으로
    // 읽으면 그 끝이 책의 끝이므로 두 색이 자리를 바꾼다. accent가 트랙 전체를
    // 달리고, 채움이 아직 남은 페이지를 덮는다.
    scene(
      program,
      given(readingModel()),
      expect(track).toHaveClass('bg-accent'),
      expect(filled).toHaveClass('bg-edge'),
    )
  })

  test('reading left to right, the fill is the fill', () => {
    scene(
      program,
      given(readingModel(0, { ...defaultSettings, direction: 'ltr' })),
      expect(track).toHaveClass('bg-edge'),
      expect(filled).toHaveClass('bg-accent'),
    )
  })

  test('the row of controls turns around with the reading direction', () => {
    // Next는 다음 페이지가 오는 쪽에 있어야 하고, 그쪽이 곧 슬라이더가 채워지기
    // 시작하는 쪽이다.
    scene(
      program,
      given(readingModel()),
      expect(selector('footer')).toHaveClass('flex-row-reverse'),
    )
  })

  test('and reading left to right it stays as written', () => {
    scene(
      program,
      given(readingModel(0, { ...defaultSettings, direction: 'ltr' })),
      expect(selector('footer')).not.toHaveClass('flex-row-reverse'),
    )
  })

  test('the track fills the row, so the thumb sits where it says it does', () => {
    // thumb은 행의 비율로 놓이고 트랙은 그 행을 채운다. 흐름에 다른 것이 끼면
    // 트랙만 좁아져 둘이 어긋난다.
    scene(
      program,
      given(readingModel()),
      expect(selector('input')).not.toExist(),
      expect(role('slider', { name: 'Page' })).toExist(),
    )
  })

  test('using the slider brings the chrome back', () => {
    scene(
      program,
      given({ ...readingModel(), isChromeVisible: false }),
      keydown(role('slider', { name: 'Page' }), 'ArrowLeft'),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 1,
          bookmarks: [],
          marks: [],
        }),
      ),
      ...settleTurn(1),
      // 툴바가 그저 있는 것이 아니라 돌아왔다는 뜻이다. 툴바가 내려가 있는 동안
      // 그것은 흐려지고 보조기기에서도 감춰진다.
      expect(selector('header')).toHaveAttr('aria-hidden', 'false'),
    )
  })
})

describe('bookmarks', () => {
  test('the control reflects whether this page is bookmarked', () => {
    scene(
      program,
      given(readingModel()),
      expect(role('button', { name: 'Bookmark this page' })).toHaveAttr('aria-pressed', 'false'),
      click(role('button', { name: 'Bookmark this page' })),
      expectOutMessage(
        OutMessage.UpdatedProgress({
          bookId: 'volume-1::42',
          page: 0,
          bookmarks: [0],
          marks: [],
        }),
      ),
      expect(role('button', { name: 'Remove bookmark from this page' })).toHaveAttr(
        'aria-pressed',
        'true',
      ),
    )
  })
})

describe('every page', () => {
  test('the grid opens over the reader and closes again', () => {
    scene(
      program,
      given({
        ...readingModel(),
        thumbs: {
          ...readingModel().thumbs,
          measurement: { _tag: 'Measured', containerHeight: 600 },
        },
      }),
      expect(role('dialog', { name: 'Every page' })).not.toExist(),
      click(role('button', { name: 'Show every page' })),
      Command.resolve(
        LoadThumbs,
        Message.CompletedLoadThumbs({ panels: [{ page: 0, url: 'blob:t0' }] }),
      ),
      expect(role('dialog', { name: 'Every page' })).toExist(),
      expect(role('button', { name: 'Go to page 1' })).toExist(),
      click(role('button', { name: 'Close' })),
      expect(role('dialog', { name: 'Every page' })).not.toExist(),
    )
  })

  test('picking a page from the grid goes there', () => {
    scene(
      program,
      given(measuredThumbs(readingModel())),
      click(role('button', { name: 'Go to page 3' })),
      ...settleTurn(2),
      expect(text('3 / 6')).toExist(),
      expect(role('dialog', { name: 'Every page' })).not.toExist(),
    )
  })
})
