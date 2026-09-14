/**
 * 모든 페이지를 한눈에 늘어놓는 격자와 그 안의 북마크 목록.
 */

import { Array, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { VirtualList } from '@foldkit/ui'
import clsx from 'clsx'

import { controlView } from '../../../view/control.ts'
import { THUMB_RATIO } from '../constant.ts'
import { Message } from '../message.ts'
import type { Model } from '../model.ts'
import { cellWidthFor, perRowFor, rowsFor, shownPages, urlFor } from '../thumbs.ts'

/**
 * 격자의 한 칸. 누르면 그 페이지로 간다.
 *
 * 북마크 목록에서만 지우는 버튼이 하나 더 붙는다. 책 전체를 보는 중에는 대부분의
 * 칸에 지울 것이 없어서, 있는 칸에만 붙이면 격자가 들쭉날쭉해진다. 버튼은 가는
 * 버튼 안이 아니라 형제로 둔다 — 버튼 안의 버튼은 설 수 없고, 칸의 접근 가능한
 * 이름도 "Go to page 3"으로 남아야 한다.
 */
const thumbView = (model: Model, page: number, cellWidth: number, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    String(page),
    [h.Class('relative flex shrink-0'), h.Style({ width: `${cellWidth}px` })],
    [
      h.button(
        [
          h.Class(
            clsx(
              'flex w-full flex-col items-center gap-1 rounded-lg border p-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              model.bookmarks.includes(page)
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:border-edge',
            ),
          ),
          h.Style({ height: `${Math.round(cellWidth * THUMB_RATIO)}px` }),
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
      ),
      model.showsBookmarksOnly
        ? h.button(
            [
              h.Class(
                'absolute top-1 right-1 cursor-pointer rounded-md bg-bg/80 px-1.5 py-0.5 text-xs text-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent',
              ),
              h.OnClick(Message.ClickedRemoveBookmark({ page })),
              h.AriaLabel(`Remove the bookmark on page ${page + 1}`),
            ],
            ['✕'],
          )
        : h.empty,
    ],
  )

/**
 * 모든 페이지를 한눈에. 리스트가 창을 내주므로 500페이지짜리 책이 격자 하나
 * 그리자고 이미지 500장을 뽑는 일은 없다.
 */
export const thumbsView = (model: Model, pageCount: number, h: HtmlBuilder<Message>): Html => {
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
          items: rowsFor(pages, perRowFor(model.thumbsWidth)),
          itemToKey: (_row, index) => String(index),
          containerClassName: 'flex-1 overflow-y-auto p-4',
          // 칸이 남는 자리를 고르게 나눠 가져서 행이 폭을 남김없이 쓴다. 그래서
          // 마지막 줄의 남은 칸도 위 줄의 열을 그대로 따라 왼쪽부터 찬다.
          itemToView: (row) =>
            h.div(
              [h.Class('flex justify-start gap-3 px-1')],
              Array.map(row, (page) => thumbView(model, page, cellWidthFor(model.thumbsWidth), h)),
            ),
        },
        toParentMessage: (message) => Message.GotThumbsMessage({ message }),
      }),
    ],
  )
}
