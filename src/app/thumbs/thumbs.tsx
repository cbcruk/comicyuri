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
import * as stylex from '@stylexjs/stylex'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout'
import { useState } from 'react'

import {
  colorVars,
  durationVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from '@astryxdesign/core/theme/tokens.stylex'

import { useMessages } from '../i18n/messages.ts'
import { pageAtoms } from '../../atoms/browser.ts'
import {
  THUMBS_DEFAULT_WIDTH,
  THUMBS_ID,
  THUMB_OVERSCAN,
  THUMB_RATIO,
} from '../../reader/constant.ts'
import { cellWidthFor, perRowFor, rowHeightFor, rowsFor, shownPages } from '../../reader/thumbs.ts'

/**
 * 격자 패널의 모양.
 *
 * 위 막대와 스크롤되는 본문은 `Layout`이, 위 막대의 줄 세우기는 `HStack`이 맡는다. 행과
 * 칸은 가상 리스트가 절대 위치로 놓는 것이고 칸 버튼은 버튼 안쪽의 정렬이라, 그대로 여기서
 * flex를 적는다.
 */
const styles = stylex.create({
  panel: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-background-body']} 95%, transparent)`,
    backdropFilter: 'blur(4px)',
  },
  title: {
    marginInlineEnd: 'auto',
    fontSize: textSizeVars['--font-size-base'],
    color: colorVars['--color-text-secondary'],
  },
  empty: {
    margin: 0,
    padding: spacingVars['--spacing-6'],
    textAlign: 'center',
    fontSize: textSizeVars['--font-size-base'],
    color: colorVars['--color-text-secondary'],
  },
  track: {
    position: 'relative',
    width: '100%',
  },
  // 칸이 남는 자리를 고르게 나눠 가져서 행이 폭을 남김없이 쓴다. 그래서 마지막 줄의 남은 칸도
  // 위 줄의 열을 그대로 따라 왼쪽부터 찬다.
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    display: 'flex',
    justifyContent: 'flex-start',
    gap: spacingVars['--spacing-3'],
    width: '100%',
    paddingInline: spacingVars['--spacing-1'],
  },
  cell: {
    position: 'relative',
    display: 'flex',
    flexShrink: 0,
  },
  thumb: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    width: '100%',
    padding: spacingVars['--spacing-1'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: 'transparent',
      '@media (hover: hover)': { ':hover': colorVars['--color-border'] },
    },
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: 'transparent',
    color: colorVars['--color-text-secondary'],
    fontSize: textSizeVars['--font-size-sm'],
    cursor: 'pointer',
    transitionProperty: 'border-color, color',
    transitionDuration: durationVars['--duration-fast'],
    outlineStyle: { default: 'none', ':focus-visible': 'solid' },
    outlineWidth: 2,
    outlineOffset: 2,
    outlineColor: colorVars['--color-accent'],
  },
  // 북마크된 칸은 강조색 테두리를 두른다(`R-275`). 손이 와도 그 테두리는 그대로다.
  bookmarked: {
    borderColor: colorVars['--color-accent'],
    color: colorVars['--color-accent'],
  },
  image: {
    flex: '1',
    minHeight: 0,
    objectFit: 'contain',
    borderRadius: radiusVars['--radius-inner'],
  },
  placeholder: {
    flex: '1',
    width: '100%',
    borderRadius: radiusVars['--radius-inner'],
    backgroundColor: colorVars['--color-background-gray'],
  },
  remove: {
    position: 'absolute',
    top: spacingVars['--spacing-1'],
    right: spacingVars['--spacing-1'],
  },
})

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
  const t = useMessages()
  const url = useAtomValue(pageAtoms.pageUrl(bookId, page))

  return (
    <div {...stylex.props(styles.cell)} style={{ width: `${cellWidth}px` }}>
      {/*
        칸 전체가 누르는 자리라 Astryx `Button`이 아니라 네이티브 버튼에 모양만 입힌다. `Button`은
        제 안쪽 여백과 높이를 가져서, 이미지와 번호를 담는 칸의 크기를 폭에서 정할 수 없다.
      */}
      <button
        type="button"
        aria-label={t('thumbs.goToPage', { page: page + 1 })}
        onClick={() => onSelect(page)}
        {...stylex.props(styles.thumb, isBookmarked && styles.bookmarked)}
        style={{ height: `${Math.round(cellWidth * THUMB_RATIO)}px` }}
      >
        {AsyncResult.isSuccess(url) ? (
          <img {...stylex.props(styles.image)} src={url.value} alt="" />
        ) : (
          <div {...stylex.props(styles.placeholder)} />
        )}
        <span>{page + 1}</span>
      </button>
      {canRemove ? (
        <div {...stylex.props(styles.remove)}>
          <Button
            label={t('thumbs.removeBookmark', { page: page + 1 })}
            icon={<span aria-hidden={true}>✕</span>}
            isIconOnly={true}
            variant="secondary"
            size="sm"
            onClick={() => onRemoveBookmark(page)}
          />
        </div>
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

  // 붙잡아 둘 까닭이 없는 계산이다. 페이지 수만큼 한 번 훑을 뿐이고, 리스트는 행의 개수와
  // 번호로만 읽으므로 배열이 새로 만들어져도 달라지는 것이 없다.
  const t = useMessages()
  const rows = rowsFor(shownPages(pageCount, bookmarks, showsBookmarksOnly), perRowFor(width))

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan: THUMB_OVERSCAN,
  })

  const title = showsBookmarksOnly ? t('thumbs.bookmarks') : t('thumbs.everyPage')
  const isEmpty = showsBookmarksOnly && rows.length === 0

  return (
    // `Layout`은 `role`과 이름을 제 뿌리에 넘기지 않아서, 덮는 자리와 `dialog`는 바깥 틀이 진다.
    <div role="dialog" aria-label={title} {...stylex.props(styles.panel)}>
      <Layout
        padding={0}
        header={
          <LayoutHeader hasDivider={true} padding={0}>
            <HStack align="center" gap={2} paddingInline={4} paddingBlock={2}>
              <span {...stylex.props(styles.title)}>{title}</span>
              {/*
                툴바의 "Show every page"와 이름이 겹치지 않아야 한다. 격자가 열려 있는
                동안에는 둘 다 화면에 있다.
              */}
              <Button
                label={showsBookmarksOnly ? t('thumbs.showAll') : t('thumbs.showBookmarks')}
                variant="secondary"
                size="sm"
                onClick={onToggleBookmarksOnly}
              >
                {showsBookmarksOnly ? t('thumbs.everyPage') : t('thumbs.bookmarks')}
              </Button>
              <Button label={t('thumbs.close')} variant="secondary" size="sm" onClick={onClose} />
            </HStack>
          </LayoutHeader>
        }
      >
        <LayoutContent ref={setScrollElement} id={THUMBS_ID} padding={0}>
          {/* 북마크가 없으면 행도 없어서, 트랙 위에 두어도 가상 리스트의 자리 셈이 어긋나지 않는다. */}
          {isEmpty ? <p {...stylex.props(styles.empty)}>{t('thumbs.noBookmarks')}</p> : null}
          <div
            {...stylex.props(styles.track)}
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((row) => (
              // 행의 높이는 리스트가 잡아 둔 값이 아니라 폭에서 나온 값으로 그리고, 리스트는
              // 그것을 `measureElement`로 도로 잰다. 폭이 바뀌면 그려진 높이가 먼저 바뀌고
              // 리스트가 그것을 알아차리므로, 잡아 둔 자리를 손으로 다시 셈하게 할 일이 없다.
              <div
                key={row.key}
                ref={virtualizer.measureElement}
                data-index={row.index}
                data-thumb-row=""
                {...stylex.props(styles.row)}
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
        </LayoutContent>
      </Layout>
    </div>
  )
}
