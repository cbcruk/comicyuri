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
 * The grid renders the rows its container has room for, and nothing has
 * measured that container in a test, so the measurement is supplied here.
 */
const measuredThumbs = (model: Model): Model => ({
  ...model,
  isThumbsOpen: true,
  thumbs: {
    ...model.thumbs,
    measurement: { _tag: 'Measured', containerHeight: 600 },
  },
})

const readingModel = (page = 0, settings = defaultSettings): Model => ({
  bookId: 'volume-1::42',
  openState: OpenState.Ready({ title: 'Volume 1', pageCount: 6 }),
  spread: SpreadState.Shown({ panels: [{ page, url: `blob:${page}` }] }),
  page,
  bookmarks: [],
  settings,
  zoom: ZOOM_MIN,
  pan: ORIGIN,
  gesture: Gesture.Idle(),
  isChromeVisible: true,
  isPointerOverChrome: false,
  activityToken: 0,
  lastTapAt: 0,
  maybeTapFlash: Option.none(),
  slider: Slider.init({ id: SLIDER_ID, min: 0, max: 5, step: 1 }),
  isFullscreen: false,
  isThumbsOpen: false,
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

describe('which side a page came from', () => {
  // The mark is drawn only where `import.meta.hot` is set, which a test run is.
  // A production build drops it, so this covers the development behaviour.
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

describe('page slider', () => {
  const slider = role('slider', { name: 'Page' })

  test('reading right to left, the slider starts full and empties leftward', () => {
    // Six pages, so page one sits at the right-hand end. The label still names
    // the page, because a page number does not mirror.
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
        }),
      ),
      ...settleTurn(1),
      expect(slider).toHaveAttr('aria-valuenow', '1'),
    )
  })

  const track = selector('[data-slider-track-id]')
  // The fill is the track's only child, and the height tells the two apart.
  const filled = within(track, selector('.h-full'))

  test('reading right to left, the filled part of the track sits on the right', () => {
    // The component fills from its own minimum, which is the left. Reading
    // right to left, that end is the end of the book, so the colours trade
    // places: the accent runs the whole track and the fill covers the pages
    // still to come.
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
    // Next has to sit on the side the next page comes from, which is the side
    // the slider fills from.
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
    // The thumb is placed at a percentage of the row, and the track fills the
    // row. Anything else in flow narrows the track and the two drift apart.
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
        }),
      ),
      ...settleTurn(1),
      // The toolbar is back rather than merely present: it is faded out and
      // hidden from assistive tech while the chrome is down.
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
