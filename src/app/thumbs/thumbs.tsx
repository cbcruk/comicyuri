/**
 * 모든 페이지를 한눈에 늘어놓는 격자와 그 안의 북마크 목록(`R-271`, `R-284`).
 *
 * Foldkit의 `VirtualList` 자리에 `@tanstack/react-virtual`이 선다. 늘어놓을 페이지를
 * 고르고 몇 칸에 세울지 재는 순수한 계산은 `src/reader/thumbs.ts` 그대로다 —
 * 격자가 창 너비를 따라간다는 것(`R-276`)이 거기 적혀 있다.
 *
 * 썸네일은 스테이지가 거는 것과 같은 페이지 atom이다. 그래서 칸을 세우는 것이 곧
 * 그 페이지를 뽑는 것이고, 칸이 화면에서 빠지는 것이 곧 놓아 주는 것이다. 가상
 * 리스트가 창을 내주므로 500쪽짜리 책이 500장을 풀지 않는다(`R-272`).
 */

import { useVirtualizer } from '@tanstack/react-virtual'
import { Atom, AsyncResult } from 'effect/unstable/reactivity'
import { useAtomValue } from '@effect/atom-react'
import { Button } from '@astryxdesign/core/Button'
import clsx from 'clsx'
import { useMemo, useState } from 'react'

import { pageAtoms } from '../../atoms/browser.ts'
import {
  THUMBS_DEFAULT_WIDTH,
  THUMBS_ID,
  THUMB_OVERSCAN,
  THUMB_RATIO,
} from '../../reader/constant.ts'
import { cellWidthFor, perRowFor, rowHeightFor, rowsFor, shownPages } from '../../reader/thumbs.ts'

/**
 * 격자가 놓인 자리의 너비(픽셀). 열 때 한 번 재고, 그 자리가 넓어지거나 좁아지면
 * 다시 잰다(`R-276`).
 *
 * Foldkit은 `window.innerWidth`를 물었지만 여기서는 격자 자신을 잰다. 행이 실제로
 * 쓸 수 있는 너비가 그것이라, 세로 막대가 서 있어도 칸이 밖으로 밀려나지 않는다.
 * 막대가 없을 때의 값은 둘이 같다.
 *
 * 요소 하나가 atom 하나다. 관찰자는 그 atom의 수명에 매여 있어, 격자가 닫혀 아무도 이
 * 너비를 원하지 않게 되면 레지스트리가 atom을 치우면서 관찰도 끝난다.
 *
 * `Atom.family`로 묶지 않는 것은 그것이 인자를 구조적으로 해싱하기 때문이다. DOM 요소를
 * 해싱하면 게터를 엉뚱한 수신자로 읽다가 `Illegal invocation`을 던진다. 요소는 identity가
 * 곧 정체이므로 `WeakMap`으로 묶고, 요소가 문서에서 사라지면 atom도 함께 놓인다.
 */
const widthAtoms = new WeakMap<HTMLElement, Atom.Atom<number>>()

const widthOf = (element: HTMLElement): Atom.Atom<number> => {
  const cached = widthAtoms.get(element)
  if (cached !== undefined) return cached

  const atom = Atom.make((get) => {
    const observer = new ResizeObserver(() => get.setSelf(element.clientWidth))
    observer.observe(element)
    get.addFinalizer(() => observer.disconnect())

    return element.clientWidth
  })
  widthAtoms.set(element, atom)
  return atom
}

/** 격자가 아직 문서에 붙지 않아 잴 것이 없을 때의 너비. */
const unmeasuredWidth = Atom.make(THUMBS_DEFAULT_WIDTH)

/** 격자의 한 칸이 받는 것. */
type ThumbProps = Readonly<{
  bookId: string
  page: number
  /** 칸 하나가 차지할 너비(픽셀). 높이도 이것을 따라간다. */
  cellWidth: number
  isBookmarked: boolean
  /** 북마크를 지우는 버튼을 붙일지. 북마크 목록에서만 붙는다(`R-286`). */
  canRemove: boolean
  onSelect: (page: number) => void
  onRemoveBookmark: (page: number) => void
}>

/**
 * 격자의 한 칸. 누르면 그 페이지로 간다(`R-273`).
 *
 * 이 칸이 서 있는 동안에만 그 페이지 atom이 걸린다. 화면 밖으로 나가면 atom을
 * 원하는 곳이 없어지고, 레지스트리가 치우며 URL도 함께 놓인다.
 *
 * 북마크 목록에서만 지우는 버튼이 하나 더 붙는다. 책 전체를 보는 중에는 대부분의
 * 칸에 지울 것이 없어서, 있는 칸에만 붙이면 격자가 들쭉날쭉해진다. 버튼은 가는
 * 버튼 안이 아니라 형제로 둔다 — 버튼 안의 버튼은 설 수 없고, 칸의 접근 가능한
 * 이름도 "Go to page 3"으로 남아야 한다.
 */
const Thumb = ({
  bookId,
  page,
  cellWidth,
  isBookmarked,
  canRemove,
  onSelect,
  onRemoveBookmark,
}: ThumbProps) => {
  const url = useAtomValue(pageAtoms.pageUrl(bookId, page))

  return (
    <div className="relative flex shrink-0" style={{ width: `${cellWidth}px` }}>
      <button
        type="button"
        aria-label={`Go to page ${page + 1}`}
        onClick={() => onSelect(page)}
        style={{ height: `${Math.round(cellWidth * THUMB_RATIO)}px` }}
        className={clsx(
          'flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border p-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          isBookmarked
            ? 'border-accent text-accent'
            : 'border-transparent text-muted hover:border-edge',
        )}
      >
        {AsyncResult.isSuccess(url) ? (
          <img className="min-h-0 flex-1 rounded object-contain" src={url.value} alt="" />
        ) : (
          <div className="w-full flex-1 rounded bg-surface-2" />
        )}
        <span>{page + 1}</span>
      </button>
      {canRemove ? (
        <button
          type="button"
          aria-label={`Remove the bookmark on page ${page + 1}`}
          onClick={() => onRemoveBookmark(page)}
          className="absolute top-1 right-1 cursor-pointer rounded-md bg-bg/80 px-1.5 py-0.5 text-xs text-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}

/** 격자가 받는 것. 리더의 상태가 아니라 그 상태에서 뽑아낸 값들이다. */
export type ThumbsProps = Readonly<{
  bookId: string
  pageCount: number
  bookmarks: ReadonlyArray<number>
  /** 북마크만 늘어놓는 중인지(`R-284`). */
  showsBookmarksOnly: boolean
  onSelect: (page: number) => void
  onToggleBookmarksOnly: () => void
  onRemoveBookmark: (page: number) => void
  onClose: () => void
}>

/**
 * 모든 페이지를 한눈에. 리더 위에 덮이는 패널이다(`R-271`).
 *
 * 잰 너비 하나에서 셋이 갈라져 나온다 — 한 행에 설 칸의 수, 칸의 너비, 행의
 * 높이다(`R-276`). 가상 리스트에 먹이는 높이도 그 하나에서 나오므로, 폭이 바뀌면
 * 리스트가 잡는 자리와 그려지는 높이가 함께 움직인다.
 */
export const ThumbsPanel = ({
  bookId,
  pageCount,
  bookmarks,
  showsBookmarksOnly,
  onSelect,
  onToggleBookmarksOnly,
  onRemoveBookmark,
  onClose,
}: ThumbsProps) => {
  // 잴 요소를 상태로 쥔다. 붙는 순간 한 번 더 그려지며, 그 렌더는 칠하기 전에 끝나므로
  // 기본 너비로 그린 격자가 화면에 비치지 않는다.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const width = useAtomValue(scrollElement === null ? unmeasuredWidth : widthOf(scrollElement))

  const cellWidth = cellWidthFor(width)
  const rowHeight = rowHeightFor(width)

  const rows = useMemo(
    () => rowsFor(shownPages(pageCount, bookmarks, showsBookmarksOnly), perRowFor(width)),
    [pageCount, bookmarks, showsBookmarksOnly, width],
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan: THUMB_OVERSCAN,
  })

  const title = showsBookmarksOnly ? 'Bookmarks' : 'Every page'
  const isEmpty = showsBookmarksOnly && rows.length === 0

  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute inset-0 z-10 flex flex-col bg-bg/95 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 border-b border-edge px-4 py-2">
        <span className="mr-auto text-sm text-muted">{title}</span>
        {/*
          툴바의 "Show every page"와 이름이 겹치지 않아야 한다. 격자가 열려 있는
          동안에는 둘 다 화면에 있다.
        */}
        <Button
          label={showsBookmarksOnly ? 'Show all pages' : 'Show bookmarks only'}
          variant="secondary"
          size="sm"
          onClick={onToggleBookmarksOnly}
        >
          {showsBookmarksOnly ? 'Every page' : 'Bookmarks'}
        </Button>
        <Button label="Close" variant="secondary" size="sm" onClick={onClose} />
      </div>
      {isEmpty ? (
        <p className="p-6 text-center text-sm text-muted">Nothing is bookmarked in this book yet</p>
      ) : null}
      <div ref={setScrollElement} id={THUMBS_ID} className="flex-1 overflow-y-auto">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((row) => (
            // 칸이 남는 자리를 고르게 나눠 가져서 행이 폭을 남김없이 쓴다. 그래서
            // 마지막 줄의 남은 칸도 위 줄의 열을 그대로 따라 왼쪽부터 찬다.
            //
            // 행의 높이는 리스트가 잡아 둔 값이 아니라 폭에서 나온 값으로 그리고, 리스트는
            // 그것을 `measureElement`로 도로 잰다. 폭이 바뀌면 그려진 높이가 먼저 바뀌고
            // 리스트가 그것을 알아차리므로, 잡아 둔 자리를 손으로 다시 셈하게 할 일이 없다.
            <div
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              className="absolute top-0 left-0 flex w-full justify-start gap-3 px-1"
              style={{ height: `${rowHeight}px`, transform: `translateY(${row.start}px)` }}
            >
              {(rows[row.index] ?? []).map((page) => (
                <Thumb
                  key={page}
                  bookId={bookId}
                  page={page}
                  cellWidth={cellWidth}
                  isBookmarked={bookmarks.includes(page)}
                  canRemove={showsBookmarksOnly}
                  onSelect={onSelect}
                  onRemoveBookmark={onRemoveBookmark}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
