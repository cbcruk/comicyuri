/**
 * 리더 위쪽의 툴바. 스스로 숨지 않고, 손으로 숨기면 푸터와 함께 화면에서 빠진다(`R-252`).
 */

import { Array, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { FitMode } from '../../../types.ts'
import { controlView } from '../../../view/control.ts'
import { Message } from '../message.ts'
import type { Model } from '../model.ts'

const FIT_LABEL: Record<FitMode, string> = {
  contain: 'Fit',
  width: 'Width',
  height: 'Height',
  original: '1:1',
}

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

/**
 * 리더의 툴바. 책장으로 돌아가기, 지금 자리와 파일 이름, 그리고 읽는 방식을 바꾸는
 * 버튼들이다.
 *
 * @param here 지금 화면에 걸린 페이지들. 두 장 스프레드면 둘이다.
 * @param names 책의 페이지별 파일 이름. 번호가 페이지 번호다.
 */
export const toolbarView = (
  model: Model,
  here: ReadonlyArray<number>,
  pageCount: number,
  names: ReadonlyArray<string>,
  h: HtmlBuilder<Message>,
): Html =>
  h.header(
    [h.Class('flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2')],
    [
      controlView({ label: '← Shelf', message: Message.ClickedExit() }, h),
      counterView(
        counterLabel(here, pageCount),
        namesLabel(here, names),
        fullNamesLabel(here, names),
        h,
      ),
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
          label: 'Hide',
          message: Message.ClickedToggleChrome(),
          attributes: [h.AriaLabel('Hide the toolbar')],
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
          label: model.isPlaying ? '⏸' : '▶',
          message: Message.ClickedToggleSlideshow(),
          attributes: [
            h.AriaLabel(model.isPlaying ? 'Stop the slideshow' : 'Start the slideshow'),
            h.AriaPressed(model.isPlaying ? 'true' : 'false'),
          ],
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
