import { Array, Option } from 'effect'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'

import { Button, Slider, Switch, VirtualList } from '@foldkit/ui'
import clsx from 'clsx'

import type { AtBookEnd, FitMode, Settings } from '../../types.ts'
import {
  COVER_ALONE_ID,
  ENLARGE_ID,
  PAGE_ID,
  REMEMBER_ID,
  SPLIT_ID,
  STAGE_ID,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  THRESHOLD_STEP,
  THUMB_ROW_HEIGHT,
} from './constant.ts'
import { ZOOM_MIN } from './gesture.ts'
import { Message } from './message.ts'
import { Model, OpenState, SpreadState } from './model.ts'
import type { TapFlash } from './model.ts'
import type { Panel } from './model.ts'
import { sideOf } from './half.ts'
import { swapsSides } from './rotation.ts'
import { indexOfPage, pagesAt, splitRatio, spreadsFor } from './spread.ts'
import { sliderPage } from './update.ts'
import { rowsFor, shownPages, urlFor } from './thumbs.ts'

const FIT_LABEL: Record<FitMode, string> = {
  contain: 'Fit',
  width: 'Width',
  height: 'Height',
  original: '1:1',
}

/**
 * 맞춤 모드에 따라 페이지를 화면에 어떻게 앉힐지.
 *
 * 통째로 맞춤은 최대 크기만 걸고 크기는 이미지에 맡긴다. 그래서 화면보다 작은
 * 페이지는 원래 크기 그대로 선다 — 줄이기만 하고 늘리지는 않는다.
 */
const FIT_CLASS: Record<FitMode, string> = {
  contain: 'max-h-full max-w-full object-contain',
  width: 'w-full object-contain',
  height: 'h-full object-contain',
  original: 'max-w-none',
}

/**
 * 늘리지 않기로 했을 때 채우는 맞춤에 함께 거는 상한. `max-content`가 그 이미지의
 * 원래 크기이므로, 채우되 원본을 넘지는 않는다.
 */
const NO_ENLARGE_CLASS: Record<FitMode, string> = {
  contain: '',
  width: 'max-w-max',
  height: 'max-h-max',
  original: '',
}

const fitClassName = (fit: FitMode, enlargeToFit: boolean): string =>
  clsx(FIT_CLASS[fit], { [NO_ENLARGE_CLASS[fit]]: !enlargeToFit && NO_ENLARGE_CLASS[fit] !== '' })

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

/**
 * 긴 파일 이름을 줄일 때 남길 글자 수. 한 장이면 넉넉하고, 두 장이면 둘이 나란히
 * 서야 하므로 절반씩이다.
 */
const nameTailFor = (count: number): number => (count > 1 ? 12 : 24)

/**
 * 이름을 꼬리부터 남기고 앞을 줄인다.
 *
 * 줄일 곳이 앞인 이유는 스캔본의 이름이 대개 `Vol.01 Ch.003 - 045.jpg`처럼 공통된
 * 머리에 번호가 붙는 꼴이기 때문이다. 뒤를 자르면 남는 것이 페이지마다 똑같은
 * 머리뿐이라, 정렬을 확인하려고 띄운 이름이 아무것도 말해 주지 않는다.
 */
const clipStart = (name: string, tail: number): string =>
  name.length <= tail ? name : `…${name.slice(-(tail - 1))}`

/** 지금 화면에 걸린 파일들의 이름. 두 장이면 읽는 순서대로 둘 다. */
const namesLabel = (pages: ReadonlyArray<number>, names: ReadonlyArray<string>): string => {
  const shown = Array.getSomes(Array.map(pages, (page) => Array.get(names, page)))
  const tail = nameTailFor(shown.length)

  return Array.join(
    Array.map(shown, (name) => clipStart(name, tail)),
    ' · ',
  )
}

/** 줄이지 않은 이름들. 툴팁이 통째로 말해 준다. */
const fullNamesLabel = (pages: ReadonlyArray<number>, names: ReadonlyArray<string>): string =>
  Array.join(Array.getSomes(Array.map(pages, (page) => Array.get(names, page))), ' · ')

/**
 * 카운터 자리. 몇 번째 장인지 위에, 그것이 어느 파일인지 아래에 둔다.
 *
 * 파일 이름이 붙는 이유는 정렬 때문이다. 아카이브가 이름순으로 서는데 그 이름이
 * 사람의 기대와 어긋나는 책이 있고, 그때 번호만 보아서는 무엇이 어긋났는지 알
 * 수 없다. 긴 이름은 앞을 줄이고, `title`로 통째로 남겨 둔다.
 */
const counterView = (
  counter: string,
  names: string,
  fullNames: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('mx-auto flex min-w-0 flex-col items-center')],
    [
      h.span([h.Class('text-sm text-muted')], [counter]),
      names === ''
        ? h.empty
        : h.span(
            [h.Class('max-w-[28ch] truncate text-xs text-muted/70'), h.Title(fullNames)],
            [names],
          ),
    ],
  )

const toolbarView = (
  model: Model,
  counter: string,
  names: string,
  fullNames: string,
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
      counterView(counter, names, fullNames, h),
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
          label: '⚙',
          message: Message.ClickedToggleSettings(),
          attributes: [h.AriaLabel('Reading settings'), h.AriaExpanded(model.isSettingsOpen)],
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
          label: '⟳',
          message: Message.ClickedRotate(),
          attributes: [h.AriaLabel('Turn the page a quarter clockwise')],
        },
        h,
      ),
      // 한 장 모드에는 뒤집을 묶기가 없으므로 자리도 두지 않는다.
      model.settings.view === 'spread'
        ? controlView(
            {
              label: '⇹',
              message: Message.ClickedToggleBinding(),
              attributes: [h.AriaLabel('Flip how this spread is paired')],
            },
            h,
          )
        : h.empty,
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

/** 반씩 읽는 중인 페이지와, 그중 지금 보고 있는 쪽. */
type SplitHalf = Readonly<{
  /** 나뉘기 전 페이지의 가로세로비. 반쪽은 그 절반이다. */
  ratio: number
  /** 화면의 어느 쪽 반인지. */
  side: 'left' | 'right'
}>

/**
 * 반쪽 하나. 상자가 반쪽의 비를 지고 화면 안에 들어가고, 그 안에서 이미지는 두 배
 * 너비로 서서 보고 있는 쪽만 상자에 걸린다.
 *
 * 상자 크기를 컨테이너 단위로 재는 이유는 세워 둔 페이지 때문이다(`R-228`). 페이지를
 * 담은 상자가 누우면 `cqw`·`cqh`도 함께 누우므로 반쪽이 그것을 따라간다.
 */
const halfView = (panel: Panel, half: SplitHalf, h: HtmlBuilder<Message>): Html => {
  const ratio = half.ratio / 2

  return h.div(
    [
      h.Class('relative overflow-hidden'),
      h.Style({
        width: `min(100cqw, calc(100cqh * ${ratio}))`,
        aspectRatio: `${ratio}`,
      }),
    ],
    [
      h.keyed('img')(`${panel.page}-${half.side}`, [
        h.Class('absolute top-0 h-full w-[200%] max-w-none'),
        h.Style({ left: half.side === 'left' ? '0' : '-100%' }),
        h.Src(panel.url),
        h.Alt(`Page ${panel.page + 1}`),
        h.Draggable(false),
      ]),
    ],
  )
}

const panelView = (
  panel: Panel,
  fit: FitMode,
  enlargeToFit: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('img')(String(panel.page), [
    h.Class(fitClassName(fit, enlargeToFit)),
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
  model: Model,
  maybeHalf: Option.Option<SplitHalf>,
  h: HtmlBuilder<Message>,
): Html => {
  const { settings, spread, zoom, pan, entry, rotation } = model

  return h.div(
    [
      h.Id(STAGE_ID),
      // 세운 페이지를 담을 상자는 화면의 높이만큼 넓어야 한다. `cqh`·`cqw`가 그
      // 두 값을 주고, 그러려면 스테이지가 크기를 재는 컨테이너여야 한다.
      h.Class(
        'relative flex flex-1 touch-none items-center justify-center overflow-hidden bg-black/20 p-2 [container-type:size]',
      ),
    ],
    [
      // 페이지 번호를 키로 삼아, 넘길 때마다 이 상자를 새로 세운다. 그러지 않으면
      // 앞 페이지를 굴려 둔 자리에서 새 페이지가 미끄러져 들어온다 — 아래 전환
      // 애니메이션이 그 transform까지 애니메이션할 값으로 보기 때문이다. 미끄러지는
      // 동안에는 페이지가 어디까지 왔는지 재는 값도 사실이 아니다.
      h.keyed('div')(
        String(model.page),
        [
          h.Id(PAGE_ID),
          h.Class(
            // 맞춤 모드는 페이지에 `h-full`·`w-full`·`max-h-full`을 건다. 퍼센트
            // 크기는 담는 상자가 크기를 정해 두어야 풀리는데, 이 상자는 스테이지의
            // flex 자식이라 내버려 두면 내용만큼만 커진다. 그러면 페이지가 자기
            // 크기를 기준으로 자기를 재는 꼴이라 어떤 맞춤 모드도 듣지 않는다.
            //
            // 세로로 세우는 것은 `items-center-safe`다. 화면에 들어가는 페이지는
            // 가운데에 놓고, 넘치는 페이지는 잘리는 쪽 대신 시작하는 쪽에 붙인다.
            // 그냥 `items-center`면 긴 페이지가 위아래로 똑같이 잘려서 첫 줄부터
            // 볼 수 없다.
            //
            // 뒤로 넘겨 온 페이지는 끝에서 시작한다(`R-247`). `flex-wrap-reverse`가
            // 교차축의 시작을 아래로 뒤집으므로, 넘치는 쪽에 붙는 자리도 함께
            // 뒤집힌다 — 화면에 들어가는 페이지는 그대로 가운데다.
            clsx('flex items-center-safe justify-center gap-1 [container-type:size]', {
              // 눕힌 상자는 가로와 세로가 맞바뀐다. 그래야 세운 페이지에 맞춤
              // 모드가 화면 크기대로 걸린다.
              'h-full w-full': !swapsSides(rotation),
              'h-[100cqw] w-[100cqh]': swapsSides(rotation),
              'flex-row-reverse': settings.direction === 'rtl',
              'flex-wrap-reverse': entry === 'end',
              // 확대를 풀고 제자리로 돌아가는 것은 애니메이션할 값이 있지만,
              // 끌고 있는 중도, 굴려서 페이지를 움직이는 중도 아니다.
              'transition-transform': zoom === ZOOM_MIN && pan.x === 0 && pan.y === 0,
            }),
          ),
          // 세우는 것이 맨 오른쪽이라 먼저 걸린다. 그래서 확대와 이동은 세운 뒤에도
          // 화면 좌표 그대로다 — 제스처가 재는 좌표와 같은 뜻으로 남는다.
          h.Style({
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
          }),
        ],
        SpreadState.match(spread, {
          Loading: () => [h.p([h.Class('text-sm text-muted')], ['Loading…'])],
          Failed: ({ text }) => [h.p([h.Class('text-sm text-danger')], [text])],
          Shown: ({ panels }) =>
            Array.map(panels, (panel) =>
              Option.match(maybeHalf, {
                onNone: () => panelView(panel, settings.fit, settings.enlargeToFit, h),
                onSome: (half) => halfView(panel, half, h),
              }),
            ),
        }),
      ),
      SHOWS_TAP_FLASH
        ? Option.match(model.maybeTapFlash, {
            onNone: () => h.empty,
            onSome: (flash) => tapFlashView(flash, h),
          })
        : h.empty,
    ],
  )
}

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

const AT_BOOK_END_LABEL: Record<AtBookEnd, string> = {
  next: 'Next book',
  wrap: 'Back to start',
  stop: 'Stay put',
}

const AT_BOOK_END_ORDER: ReadonlyArray<AtBookEnd> = ['next', 'wrap', 'stop']

const settingRowClassName =
  'flex flex-wrap items-center justify-between gap-3 border-b border-edge py-3'

/** 설정 한 줄. 왼쪽에 무엇을 정하는지, 오른쪽에 그것을 정하는 것. */
const settingRow = (label: string, control: Html, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class(settingRowClassName)], [h.span([h.Class('text-sm text-ink')], [label]), control])

/**
 * 여럿 중 하나를 고르는 줄. 고른 것이 `aria-pressed`로 드러나므로, 어느 것이
 * 켜져 있는지 보이지 않고도 읽힌다.
 */
const choiceView = <A extends string>(
  options: ReadonlyArray<A>,
  chosen: A,
  label: (option: A) => string,
  toMessage: (option: A) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('flex flex-wrap gap-2')],
    Array.map(options, (option) =>
      h.keyed('span')(
        option,
        [h.Class('contents')],
        [
          controlView(
            {
              label: label(option),
              message: toMessage(option),
              attributes: [h.AriaPressed(option === chosen ? 'true' : 'false')],
            },
            h,
          ),
        ],
      ),
    ),
  )

const thresholdView = (settings: Settings, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex items-center gap-2')],
    [
      controlView(
        {
          label: '−',
          message: Message.ClickedNudgeThreshold({ by: -THRESHOLD_STEP }),
          attributes: [
            h.AriaLabel('Pair more pages'),
            h.AriaDisabled(settings.singleThreshold <= THRESHOLD_MIN),
          ],
        },
        h,
      ),
      h.span(
        [h.Class('w-12 text-center text-sm tabular-nums text-muted')],
        [settings.singleThreshold.toFixed(2)],
      ),
      controlView(
        {
          label: '+',
          message: Message.ClickedNudgeThreshold({ by: THRESHOLD_STEP }),
          attributes: [
            h.AriaLabel('Pair fewer pages'),
            h.AriaDisabled(settings.singleThreshold >= THRESHOLD_MAX),
          ],
        },
        h,
      ),
    ],
  )

/** 스위치 한 줄. 이름을 자기 라벨에서 가져가므로 줄 전체를 스위치가 그린다. */
const switchRow = (
  config: Readonly<{
    id: string
    label: string
    isChecked: boolean
    onToggle: (isChecked: boolean) => Message
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Switch.view(
    {
      id: config.id,
      isChecked: config.isChecked,
      onToggle: config.onToggle,
      toView: (attributes) =>
        h.div(
          [h.Class(settingRowClassName)],
          [
            h.span([...attributes.label, h.Class('text-sm text-ink')], [config.label]),
            h.button(
              [...attributes.button, h.Class(controlClassName)],
              [config.isChecked ? 'On' : 'Off'],
            ),
          ],
        ),
    },
    h,
  )

/**
 * 읽는 규칙을 한 번 정해 두는 자리.
 *
 * 툴바에 이미 버튼이 있는 것들 — 방향, 한 장/두 장, 맞춤 — 은 여기 없다. 그것들은
 * 읽는 동안 손이 가는 것이고, 여기 있는 셋은 책을 열기 전에 한 번 정하는 것이다.
 */
const settingsView = (settings: Settings, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class('absolute inset-0 z-10 flex flex-col bg-bg/95 backdrop-blur-sm'),
      h.Role('dialog'),
      h.AriaLabel('Reading settings'),
    ],
    [
      h.div(
        [h.Class('flex items-center gap-2 border-b border-edge px-4 py-2')],
        [
          h.span([h.Class('mr-auto text-sm text-muted')], ['Reading settings']),
          controlView({ label: 'Close', message: Message.ClickedToggleSettings() }, h),
        ],
      ),
      h.div(
        [h.Class('flex-1 overflow-y-auto px-4')],
        [
          switchRow(
            {
              id: COVER_ALONE_ID,
              label: 'Cover on its own',
              isChecked: settings.coverAlone,
              onToggle: (isChecked) => Message.ToggledCoverAlone({ isChecked }),
            },
            h,
          ),
          settingRow('A page wider than this stands alone', thresholdView(settings, h), h),
          switchRow(
            {
              id: SPLIT_ID,
              label: 'Read wide pages in halves',
              isChecked: settings.splitWide,
              onToggle: (isChecked) => Message.ToggledSplitWide({ isChecked }),
            },
            h,
          ),
          switchRow(
            {
              id: ENLARGE_ID,
              label: 'Stretch small pages to fit',
              isChecked: settings.enlargeToFit,
              onToggle: (isChecked) => Message.ToggledEnlargeToFit({ isChecked }),
            },
            h,
          ),
          switchRow(
            {
              id: REMEMBER_ID,
              label: 'Remember these for each book',
              isChecked: settings.rememberBookSettings,
              onToggle: (isChecked) => Message.ToggledRememberBookSettings({ isChecked }),
            },
            h,
          ),
          settingRow(
            'At the end of a book',
            choiceView(
              AT_BOOK_END_ORDER,
              settings.atBookEnd,
              (option) => AT_BOOK_END_LABEL[option],
              (atBookEnd) => Message.SelectedAtBookEnd({ atBookEnd }),
              h,
            ),
            h,
          ),
        ],
      ),
    ],
  )

/**
 * 모든 페이지를 한눈에. 리스트가 창을 내주므로 500페이지짜리 책이 격자 하나
 * 그리자고 이미지 500장을 뽑는 일은 없다.
 */
const thumbsView = (model: Model, pageCount: number, h: HtmlBuilder<Message>): Html => {
  const pages = shownPages(pageCount, model.bookmarks, model.showsBookmarksOnly)

  return h.div(
    [
      h.Class('absolute inset-0 z-10 flex flex-col bg-bg/95 backdrop-blur-sm'),
      h.Role('dialog'),
      h.AriaLabel(model.showsBookmarksOnly ? 'Bookmarks' : 'Every page'),
    ],
    [
      h.div(
        [h.Class('flex items-center gap-2 border-b border-edge px-4 py-2')],
        [
          h.span(
            [h.Class('mr-auto text-sm text-muted')],
            [model.showsBookmarksOnly ? 'Bookmarks' : 'Every page'],
          ),
          controlView(
            {
              label: model.showsBookmarksOnly ? 'Every page' : 'Bookmarks',
              message: Message.ClickedToggleBookmarksOnly(),
              // 툴바의 "Show every page"와 이름이 겹치지 않아야 한다. 격자가
              // 열려 있는 동안에는 둘 다 화면에 있다.
              attributes: [
                h.AriaLabel(model.showsBookmarksOnly ? 'Show all pages' : 'Show bookmarks only'),
              ],
            },
            h,
          ),
          controlView({ label: 'Close', message: Message.ClickedToggleThumbs() }, h),
        ],
      ),
      model.showsBookmarksOnly && pages.length === 0
        ? h.p(
            [h.Class('flex-1 p-6 text-center text-sm text-muted')],
            ['Nothing is bookmarked in this book yet'],
          )
        : h.empty,
      h.submodel({
        slotId: model.thumbs.id,
        model: model.thumbs,
        view: VirtualList.view<ReadonlyArray<number>>(),
        viewInputs: {
          items: rowsFor(pages),
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
}

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
    Ready: ({ title, pageCount, ratios, names }) => {
      const layout = { pageCount, ratios, marks: model.marks }
      const spreads = spreadsFor(layout, model.settings)
      const index = indexOfPage(spreads, model.page)
      const here = pagesAt(spreads, index)
      const maybeHalf = Option.map(
        splitRatio(layout, model.settings, here),
        (ratio): SplitHalf => ({ ratio, side: sideOf(model.half, model.settings.direction) }),
      )

      return h.main(
        [h.Class('relative flex h-full flex-col'), h.AriaLabel(title)],
        [
          toolbarView(
            model,
            counterLabel(here, pageCount),
            namesLabel(here, names),
            fullNamesLabel(here, names),
            model.isChromeVisible,
            h,
          ),
          stageView(model, maybeHalf, h),
          turnView(model, model.isChromeVisible, h),
          model.isThumbsOpen ? thumbsView(model, pageCount, h) : h.empty,
          model.isSettingsOpen ? settingsView(model.settings, h) : h.empty,
        ],
      )
    },
  }),
)
