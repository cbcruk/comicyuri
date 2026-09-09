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
import { sliderPage } from './update.ts'
import { rowsFor, urlFor } from './thumbs.ts'

const FIT_LABEL: Record<FitMode, string> = {
  contain: 'Fit',
  width: 'Width',
  height: 'Height',
  original: '1:1',
}

/** 맞춤 모드에 따라 페이지를 화면에 어떻게 앉힐지. */
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

/** 툴바는 읽는 동안 사라지고, 탭 순서에서도 함께 빠진다. */
const chromeClassName = (isVisible: boolean): string =>
  clsx('transition-opacity', { 'pointer-events-none opacity-0': !isVisible })

/**
 * 툴바 위에 머무는 포인터는 아직 쓰고 있다는 뜻이므로, 포인터가 있는 동안에는
 * 툴바를 숨기는 대기를 붙잡아 둔다.
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
    // 이미지는 기본으로 끌 수 있고, 끌기 시작하면 브라우저가 포인터 이벤트를 거두어
    // 드래그 이벤트로 갈아탄다. 그러면 스와이프가 첫 움직임 뒤에 잘린다 — 포인터로
    // 넘기려던 페이지 대신 이미지가 끌려간다.
    h.Draggable(false),
  ])

/**
 * 화면이 곧 제스처를 받는 면이다. 그래서 포인터 구독이 찾는 id를 달고, 터치
 * 처리를 브라우저에서 가져온다. 줌과 이동은 안쪽 요소에 걸린 하나의 transform이다.
 * 제스처 계산이 쓰는 중심 기준 좌표가 계속 그 뜻을 지키려면 바깥쪽은 가만히
 * 있어야 한다.
 */
/**
 * 페이지 넘김 표시를 그릴지. `import.meta.hot`은 Foldkit 런타임 자신이 개발과
 * 프로덕션 빌드를 가르는 방법이고 빌드 때 상수로 바뀌므로, 프로덕션 번들에서는
 * 표시도 그것을 그리는 분기도 사라진다.
 *
 * Model은 어느 쪽이든 넘김을 기록한다. 그것을 조건 없이 두었기에 어떤 빌드가
 * 도는지 묻지 않고도 동작을 테스트할 수 있다.
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
            // 맞춤 모드는 페이지에 `h-full`·`w-full`·`max-h-full`을 건다. 퍼센트
            // 크기는 담는 상자가 크기를 정해 두어야 풀리는데, 이 상자는 스테이지의
            // flex 자식이라 내버려 두면 내용만큼만 커진다. 그러면 페이지가 자기
            // 크기를 기준으로 자기를 재는 꼴이라 어떤 맞춤 모드도 듣지 않는다.
            clsx('flex h-full w-full items-center justify-center gap-1', {
              'flex-row-reverse': settings.direction === 'rtl',
              // 확대를 풀고 제자리로 돌아가는 것은 애니메이션할 값이 있지만,
              // 끌고 있는 중은 아니다.
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
 * 책 전체를 훑는 자리. 키보드 지원은 컴포넌트가 가져다준다.
 *
 * thumb은 가장 가까운 positioned 조상인 이 루트의 비율로 놓이고, 트랙은 그 루트의
 * 너비를 채운다. 여기 흐름에 다른 것이 끼면 thumb은 그대로인 채 트랙만 좁아지므로,
 * 폼 `name` 없이는 아무것도 나르지 않는 컴포넌트의 숨은 input은 빼 두었다.
 */
const sliderView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isRightToLeft = model.settings.direction === 'rtl'

  return h.submodel({
    slotId: model.slider.id,
    model: model.slider,
    view: Slider.view,
    viewInputs: {
      // 오른쪽에서 왼쪽으로 읽을 때는 슬라이더 값이 반대로 간다. 그래야 슬라이더
      // 자신의 화살표 키와 드래그가 기대한 쪽을 가리킨다. 라벨은 다시 되돌리는데,
      // 페이지 번호는 뒤집히지 않기 때문이다.
      value: sliderPage(model, model.page),
      ariaLabel: 'Page',
      formatValue: (value) => `Page ${sliderPage(model, value) + 1}`,
      toView: (attributes) =>
        h.div(
          [
            ...attributes.root,
            h.Class('relative flex h-6 flex-1 touch-none items-center select-none'),
          ],
          [
            // 컴포넌트는 늘 자기 최솟값부터 채우는데, 오른쪽에서 왼쪽으로 읽으면
            // 그 끝이 책의 끝이다. 그래서 이 방향에서는 두 색이 자리를 바꾼다.
            // 트랙이 길이 전체에 읽은 색을 깔고, 컴포넌트의 채움이 아직 읽지 않은
            // 만큼을 덮는다.
            h.div(
              [
                ...attributes.track,
                h.Class(clsx('h-1.5 w-full rounded-full', isRightToLeft ? 'bg-accent' : 'bg-edge')),
              ],
              [
                h.div([
                  ...attributes.filledTrack,
                  h.Class(clsx('h-full rounded-full', isRightToLeft ? 'bg-edge' : 'bg-accent')),
                ]),
              ],
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
}

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
 * 모든 페이지를 한눈에. 리스트가 창을 내주므로 500페이지짜리 책이 격자 하나
 * 그리자고 이미지 500장을 뽑는 일은 없다.
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
          // Next는 다음 페이지가 오는 쪽, 그러니까 이제 슬라이더가 채워지기
          // 시작하는 쪽에 선다.
          { 'flex-row-reverse': model.settings.direction === 'rtl' },
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

/**
 * 리더를 그린다. 화면, 그 위에 얹히는 툴바와 넘김 버튼들, 그리고 열려 있다면
 * 페이지 격자.
 */
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
