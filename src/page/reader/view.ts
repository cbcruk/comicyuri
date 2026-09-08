import { Array, Option } from 'effect'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'

import { Button, Slider, VirtualList } from '@foldkit/ui'
import clsx from 'clsx'

import type { FitMode, Settings } from '../../types.ts'
import { STAGE_ID, THUMB_ROW_HEIGHT } from './constant.ts'
import { ZOOM_MIN } from './gesture.ts'
import type { Point } from './gesture.ts'
import { Message } from './message.ts'
import { Model, OpenState, SpreadState } from './model.ts'
import type { TapFlash } from './model.ts'
import type { Panel } from './model.ts'
import { indexOfPage, spreadsFor } from './spread.ts'
import { rowsFor, urlFor } from './thumbs.ts'

const FIT_LABEL: Record<FitMode, string> = {
  contain: 'Fit',
  width: 'Width',
  height: 'Height',
  original: '1:1',
}

/** How a page is sized on the stage, per fit mode. */
const FIT_CLASS: Record<FitMode, string> = {
  contain: 'max-h-full max-w-full object-contain',
  width: 'w-full object-contain',
  height: 'h-full object-contain',
  original: 'max-w-none',
}

const controlClassName =
  'cursor-pointer rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

type ControlConfig = Readonly<{
  label: string
  message: Message
  attributes?: ReadonlyArray<Attribute<Message>>
}>

const controlView = (config: ControlConfig, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: config.message,
      toView: (attributes) =>
        h.button(
          [...attributes.button, h.Class(controlClassName), ...(config.attributes ?? [])],
          [config.label],
        ),
    },
    h,
  )

/** Chrome fades out while reading, and takes its tab stops with it. */
const chromeClassName = (isVisible: boolean): string =>
  clsx('transition-opacity', { 'pointer-events-none opacity-0': !isVisible })

/**
 * A pointer resting on the chrome is someone still using it, so the wait that
 * hides it is held for as long as the pointer is there.
 */
const chromeHoverAttributes = (h: HtmlBuilder<Message>): ReadonlyArray<Attribute<Message>> => [
  h.OnMouseEnter(Message.EnteredChrome()),
  h.OnMouseLeave(Message.LeftChrome()),
]

const counterLabel = (pages: ReadonlyArray<number>, pageCount: number): string => {
  const first = Option.getOrElse(Array.head(pages), () => 0)
  const last = Option.getOrElse(Array.last(pages), () => first)
  const shown = first === last ? `${first + 1}` : `${first + 1}–${last + 1}`
  return `${shown} / ${pageCount}`
}

const toolbarView = (
  model: Model,
  counter: string,
  isVisible: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.header(
    [
      h.Class(
        clsx(
          'flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2',
          chromeClassName(isVisible),
        ),
      ),
      h.AriaHidden(!isVisible),
      ...chromeHoverAttributes(h),
    ],
    [
      controlView({ label: '← Shelf', message: Message.ClickedExit() }, h),
      h.span([h.Class('mx-auto text-sm text-muted')], [counter]),
      controlView(
        {
          label: model.bookmarks.includes(model.page) ? '★' : '☆',
          message: Message.ClickedToggleBookmark(),
          attributes: [
            h.AriaLabel(
              model.bookmarks.includes(model.page)
                ? 'Remove bookmark from this page'
                : 'Bookmark this page',
            ),
            h.AriaPressed(model.bookmarks.includes(model.page) ? 'true' : 'false'),
          ],
        },
        h,
      ),
      controlView(
        {
          label: 'Pages',
          message: Message.ClickedToggleThumbs(),
          attributes: [h.AriaLabel('Show every page'), h.AriaExpanded(model.isThumbsOpen)],
        },
        h,
      ),
      controlView(
        {
          label: model.isFullscreen ? 'Exit full' : 'Full',
          message: Message.ClickedToggleFullscreen(),
          attributes: [h.AriaLabel(model.isFullscreen ? 'Leave fullscreen' : 'Enter fullscreen')],
        },
        h,
      ),
      controlView(
        {
          label: model.settings.direction === 'rtl' ? 'RTL' : 'LTR',
          message: Message.ClickedToggleDirection(),
          attributes: [h.AriaLabel('Toggle reading direction')],
        },
        h,
      ),
      controlView(
        {
          label: model.settings.view === 'spread' ? 'Two' : 'One',
          message: Message.ClickedToggleView(),
          attributes: [h.AriaLabel('Toggle one or two pages')],
        },
        h,
      ),
      controlView(
        {
          label: FIT_LABEL[model.settings.fit],
          message: Message.ClickedCycleFit(),
          attributes: [h.AriaLabel('Change how pages are fitted')],
        },
        h,
      ),
      controlView(
        {
          label: '−',
          message: Message.ClickedZoomOut(),
          attributes: [h.AriaLabel('Zoom out')],
        },
        h,
      ),
      controlView(
        {
          label: '+',
          message: Message.ClickedZoomIn(),
          attributes: [h.AriaLabel('Zoom in')],
        },
        h,
      ),
    ],
  )

const panelView = (panel: Panel, fit: FitMode, h: HtmlBuilder<Message>): Html =>
  h.keyed('img')(String(panel.page), [
    h.Class(FIT_CLASS[fit]),
    h.Src(panel.url),
    h.Alt(`Page ${panel.page + 1}`),
  ])

/**
 * The stage is the gesture surface, so it carries the id the pointer
 * subscriptions look for and takes touch handling away from the browser. Zoom
 * and pan are one transform on an inner element: the outer one has to stay
 * still for the centre-relative coordinates the gesture maths uses to keep
 * meaning what they say.
 */
/**
 * Whether the page-turn mark is drawn. `import.meta.hot` is how Foldkit's own
 * runtime tells development from a production build, and it is replaced with a
 * constant at build time, so a production bundle drops both the mark and the
 * branch that draws it.
 *
 * The Model records the turn either way. Keeping that unconditional is what
 * lets the behaviour be tested without asking which build is running.
 */
const SHOWS_TAP_FLASH = !!import.meta.hot

const tapFlashView = (flash: TapFlash, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(`${flash.side}-${flash.token}`, [
    h.Class(
      clsx(
        'tap-flash pointer-events-none absolute inset-y-0 w-1/3',
        flash.side === 'Left'
          ? 'left-0 bg-gradient-to-r from-accent to-transparent'
          : 'right-0 bg-gradient-to-l from-accent to-transparent',
      ),
    ),
    h.AriaHidden(true),
  ])

const stageView = (
  spread: SpreadState,
  settings: Settings,
  zoom: number,
  pan: Point,
  maybeTapFlash: Option.Option<TapFlash>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Id(STAGE_ID),
      h.Class(
        'relative flex flex-1 touch-none items-center justify-center overflow-hidden bg-black/20 p-2',
      ),
    ],
    [
      h.div(
        [
          h.Class(
            clsx('flex items-center justify-center gap-1', {
              'flex-row-reverse': settings.direction === 'rtl',
              // Snapping back to unzoomed is worth animating; a live drag is not.
              'transition-transform': zoom === ZOOM_MIN,
            }),
          ),
          h.Style({
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }),
        ],
        SpreadState.match(spread, {
          Loading: () => [h.p([h.Class('text-sm text-muted')], ['Loading…'])],
          Failed: ({ text }) => [h.p([h.Class('text-sm text-danger')], [text])],
          Shown: ({ panels }) => Array.map(panels, (panel) => panelView(panel, settings.fit, h)),
        }),
      ),
      SHOWS_TAP_FLASH
        ? Option.match(maybeTapFlash, {
            onNone: () => h.empty,
            onSome: (flash) => tapFlashView(flash, h),
          })
        : h.empty,
    ],
  )

/**
 * Scrubbing the whole book, with the keyboard support the component brings.
 *
 * The thumb is placed at a percentage of its nearest positioned ancestor,
 * which is this root, while the track fills the root's width. Anything else
 * in flow here narrows the track without moving the thumb, so the component's
 * hidden input — which carries nothing without a form `name` — is left out.
 */
const sliderView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.slider.id,
    model: model.slider,
    view: Slider.view,
    viewInputs: {
      value: model.page,
      ariaLabel: 'Page',
      formatValue: (page) => `Page ${page + 1}`,
      toView: (attributes) =>
        h.div(
          [
            ...attributes.root,
            h.Class('relative flex h-6 flex-1 touch-none items-center select-none'),
          ],
          [
            h.div(
              [...attributes.track, h.Class('h-1.5 w-full rounded-full bg-edge')],
              [h.div([...attributes.filledTrack, h.Class('h-full rounded-full bg-accent')])],
            ),
            h.div([
              ...attributes.thumb,
              h.Class(
                'h-4 w-4 cursor-grab rounded-full border-2 border-accent bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-dragging:cursor-grabbing',
              ),
            ]),
          ],
        ),
    },
    toParentMessage: (message) => Message.GotSliderMessage({ message }),
  })

const thumbView = (model: Model, page: number, h: HtmlBuilder<Message>): Html =>
  h.keyed('button')(
    String(page),
    [
      h.Class(
        clsx(
          'flex flex-1 flex-col items-center gap-1 rounded-lg border p-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          model.bookmarks.includes(page)
            ? 'border-accent text-accent'
            : 'border-transparent text-muted hover:border-edge',
        ),
      ),
      h.Style({ height: `${THUMB_ROW_HEIGHT - 24}px` }),
      h.OnClick(Message.SelectedThumb({ page })),
      h.AriaLabel(`Go to page ${page + 1}`),
    ],
    [
      Option.match(urlFor(model.thumbPanels, page), {
        onNone: () => h.div([h.Class('w-full flex-1 rounded bg-surface-2')]),
        onSome: (url) =>
          h.img([h.Class('min-h-0 flex-1 rounded object-contain'), h.Src(url), h.Alt('')]),
      }),
      h.span([], [String(page + 1)]),
    ],
  )

/**
 * Every page at once, windowed by the list so a five-hundred-page book does
 * not extract five hundred images just to draw a grid.
 */
const thumbsView = (model: Model, pageCount: number, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class('absolute inset-0 z-10 flex flex-col bg-bg/95 backdrop-blur-sm'),
      h.Role('dialog'),
      h.AriaLabel('Every page'),
    ],
    [
      h.div(
        [h.Class('flex items-center gap-2 border-b border-edge px-4 py-2')],
        [
          h.span([h.Class('mr-auto text-sm text-muted')], ['Every page']),
          controlView({ label: 'Close', message: Message.ClickedToggleThumbs() }, h),
        ],
      ),
      h.submodel({
        slotId: model.thumbs.id,
        model: model.thumbs,
        view: VirtualList.view<ReadonlyArray<number>>(),
        viewInputs: {
          items: rowsFor(pageCount),
          itemToKey: (_row, index) => String(index),
          containerClassName: 'flex-1 overflow-y-auto p-4',
          itemToView: (row) =>
            h.div(
              [h.Class('flex gap-3 px-1')],
              Array.map(row, (page) => thumbView(model, page, h)),
            ),
        },
        toParentMessage: (message) => Message.GotThumbsMessage({ message }),
      }),
    ],
  )

const turnView = (model: Model, isVisible: boolean, h: HtmlBuilder<Message>): Html =>
  h.footer(
    [
      h.Class(
        clsx(
          'flex items-center justify-between gap-2 border-t border-edge px-4 py-2',
          chromeClassName(isVisible),
        ),
      ),
      h.AriaHidden(!isVisible),
      ...chromeHoverAttributes(h),
    ],
    [
      controlView({ label: 'First', message: Message.ClickedFirst() }, h),
      controlView({ label: 'Previous', message: Message.ClickedPrevious() }, h),
      sliderView(model, h),
      controlView({ label: 'Next', message: Message.ClickedNext() }, h),
      controlView({ label: 'Last', message: Message.ClickedLast() }, h),
    ],
  )

const openingView = (text: string, h: HtmlBuilder<Message>): Html =>
  h.main(
    [h.Class('flex h-full flex-col items-center justify-center gap-3 p-6')],
    [
      h.p([h.Class('text-sm text-muted')], [text]),
      controlView({ label: '← Shelf', message: Message.ClickedExit() }, h),
    ],
  )

export const view = defineView<Model, Message>((model, h): Html =>
  OpenState.match(model.openState, {
    Opening: () => openingView('Opening…', h),
    Failed: ({ text }) => openingView(text, h),
    Ready: ({ title, pageCount }) => {
      const spreads = spreadsFor(pageCount, model.settings)
      const index = indexOfPage(spreads, model.page)

      return h.main(
        [h.Class('relative flex h-full flex-col'), h.AriaLabel(title)],
        [
          toolbarView(
            model,
            counterLabel(
              Option.getOrElse(Array.get(spreads, index), () => []),
              pageCount,
            ),
            model.isChromeVisible,
            h,
          ),
          stageView(model.spread, model.settings, model.zoom, model.pan, model.maybeTapFlash, h),
          turnView(model, model.isChromeVisible, h),
          model.isThumbsOpen ? thumbsView(model, pageCount, h) : h.empty,
        ],
      )
    },
  }),
)
