/**
 * 책 전체를 훑는 자리. Astryx `Slider` 하나에, 그것이 모르는 두 가지를 바깥에서 얹는다.
 *
 * - **눈에 보이는 쪽을 따르는 좌우 화살표.** 오른쪽에서 왼쪽으로 읽으면 슬라이더가
 *   `dir="rtl"`로 서서 첫 페이지가 오른쪽 끝이다. Astryx는 그때도 오른쪽 화살표로 값을
 *   늘리므로, 손잡이가 누른 화살표의 반대쪽으로 간다.
 * - **끄는 중의 Escape.** 잡기 전 자리로 되돌린다. 손잡이를 잘못 집어 읽던 자리를 잃는
 *   일을 이 한 키가 무른다.
 *
 * 둘 다 슬라이더를 감싼 상자가 캡처 단계에서 먼저 받는다. Astryx의 손잡이가 키를 보기
 * 전에 끝내야 하기 때문이다.
 */

import * as stylex from '@stylexjs/stylex'
import { Slider } from '@astryxdesign/core/Slider'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useRef } from 'react'

import type { ReadingDirection } from '../../types.ts'
import { pageTicks } from './ticks.ts'

/** 슬라이더를 감싼 상자. 넘김 줄에서 남는 너비를 다 가진다. */
const styles = stylex.create({
  root: {
    flex: '1',
    minWidth: 0,
  },
})

/**
 * 끄는 동안 붙잡아 두는 것. 잡은 포인터와, 잡기 전에 가리키던 페이지다.
 *
 * 잡기 전 페이지를 적어 두는 이유는 끄는 중의 Escape가 그리로 되돌리기 때문이다.
 */
type Drag = Readonly<{ pointerId: number; originPage: number }>

/** 슬라이더가 받는 것. */
export type PageSliderProps = Readonly<{
  /** 지금 페이지. `0`부터 센다. */
  page: number
  /** 책의 페이지 수. 슬라이더의 최댓값은 이것보다 하나 작다. */
  pageCount: number
  direction: ReadingDirection
  /** 슬라이더가 멈춘 자리. `0`부터 세는 페이지 번호다. */
  onSlide: (page: number) => void
}>

/**
 * 페이지 슬라이더를 그린다.
 *
 * 값은 페이지 번호 그대로다. 오른쪽에서 왼쪽으로 읽으면 `dir="rtl"`만 걸고, 첫 페이지를
 * 오른쪽 끝에 두는 일과 채움을 오른쪽부터 그리는 일은 Astryx가 한다(`R-264`). 채워진
 * 구간이 곧 읽은 만큼이다.
 *
 * 트랙 위에 페이지 눈금을 찍는다(`R-267`). 짧은 책은 모든 페이지에, 긴 책은 쉬운 간격마다
 * 찍고, 눈금을 누르면 그 페이지로 간다.
 */
export const PageSlider = ({ page, pageCount, direction, onSlide }: PageSliderProps) => {
  const isRightToLeft = direction === 'rtl'
  const max = Math.max(pageCount - 1, 0)
  const dragRef = useRef<Drag | null>(null)

  const slideTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), max)
    if (clamped !== page) onSlide(clamped)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: event.pointerId, originPage: page }
  }

  const handlePointerEnd = () => {
    dragRef.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      const drag = dragRef.current
      // 끌지 않는 중의 Escape는 리더의 것이다. 무를 끌기가 없으면 그대로 흘려보낸다.
      if (drag === null) return

      event.preventDefault()
      // 무르려고 누른 Escape가 문서까지 올라가면 리더가 그것을 한 겹 벗기라는 뜻으로
      // 읽는다(`R-2A3`). 리더의 키 구독은 document에 걸려 있으므로 네이티브 쪽을 멈춘다.
      event.nativeEvent.stopPropagation()
      endAstryxDrag(event.currentTarget, drag.pointerId)
      dragRef.current = null
      slideTo(drag.originPage)
      return
    }

    if (isRightToLeft && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault()
      event.stopPropagation()
      slideTo(page + (event.key === 'ArrowLeft' ? 1 : -1))
    }
  }

  return (
    <div
      dir={isRightToLeft ? 'rtl' : 'ltr'}
      onPointerDownCapture={handlePointerDown}
      onPointerUpCapture={handlePointerEnd}
      onPointerCancelCapture={handlePointerEnd}
      onKeyDownCapture={handleKeyDown}
      {...stylex.props(styles.root)}
    >
      <Slider
        label="Page"
        isLabelHidden={true}
        width="100%"
        min={0}
        max={max}
        value={Math.min(page, max)}
        valueDisplay="tooltip"
        marks={pageTicks(pageCount).map((value) => ({ value }))}
        formatValue={(value) => `Page ${value + 1}`}
        onChange={slideTo}
      />
    </div>
  )
}

/**
 * Astryx의 끌기를 끝낸다.
 *
 * Astryx는 끄는 중인지를 스스로 쥐고 포인터를 놓을 때만 푼다. 그래서 포인터를 받는 그릇에
 * `pointerup` 하나를 보내고, 잡아 두었던 포인터도 놓는다 — 놓지 않으면 이어진 움직임이 그대로
 * 값을 옮긴다.
 *
 * 그릇은 Astryx가 테마용으로 다는 고정 클래스로 찾는다. 손잡이의 부모로 찾으면 툴팁이
 * 손잡이를 한 겹 감쌀 때 엉뚱한 요소를 잡는다.
 */
const endAstryxDrag = (root: HTMLElement, pointerId: number): void => {
  const control = root.querySelector('.astryx-slider-control')
  if (control === null) return
  control.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, pointerId }))
  if (control.hasPointerCapture(pointerId)) control.releasePointerCapture(pointerId)
}
