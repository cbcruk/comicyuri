/**
 * 책 전체를 훑는 자리.
 *
 * Astryx의 `Slider`를 쓰지 않고 손으로 짠 이유는 `R-264` 하나다. 오른쪽에서
 * 왼쪽으로 읽으면 트랙과 채움의 색이 자리를 바꿔야 하는데, Astryx의 것은 트랙과
 * 채움을 스스로 그리고 그 안으로 손을 넣을 길이 없다. 그래서 Foldkit의 Slider가
 * 하던 것을 그대로 옮겼다 — `role="slider"`를 진 손잡이, `aria-valuemin`/`max`/
 * `now`/`valuetext`, 걸음·페이지·처음·끝 키, 그리고 끌기.
 */

import clsx from 'clsx'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useRef, useState } from 'react'

import type { ReadingDirection } from '../../types.ts'

/** PageUp·PageDown 한 번이 걸음 몇 개인지. Foldkit Slider의 것과 같은 값이다. */
const PAGE_STEP = 10

/** 값을 `0`과 `max` 사이로 자른다. */
const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max)

/**
 * 키가 옮겨 놓는 값. 슬라이더가 가져가지 않는 키면 `undefined`다.
 *
 * 화살표는 눈에 보이는 쪽을 따른다 — 값 자체가 이미 읽는 방향으로 뒤집혀 있으므로
 * (`R-264`), 여기서는 오른쪽·위가 늘 증가다.
 */
const valueForKey = (key: string, value: number, max: number): number | undefined => {
  if (key === 'ArrowRight' || key === 'ArrowUp') return clamp(value + 1, max)
  if (key === 'ArrowLeft' || key === 'ArrowDown') return clamp(value - 1, max)
  if (key === 'PageUp') return clamp(value + PAGE_STEP, max)
  if (key === 'PageDown') return clamp(value - PAGE_STEP, max)
  if (key === 'Home') return 0
  if (key === 'End') return max
  return undefined
}

/** 소수를 CSS 백분율로. 자리를 지나치게 잘게 적지 않는다. */
const percent = (fraction: number): string => `${Math.round(fraction * 10000) / 100}%`

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
 * 오른쪽에서 왼쪽으로 읽으면 첫 페이지가 오른쪽 끝이다. 슬라이더의 값은 늘 자기
 * 최솟값(왼쪽)부터 채워지므로 이 방향에서는 값을 뒤집고, 트랙이 길이 전체에 읽은
 * 색을 깔고 채움이 아직 읽지 않은 만큼을 덮는다(`R-264`). 페이지 번호는 뒤집히지
 * 않으므로 `aria-valuetext`는 그대로 1부터 센다.
 */
export const PageSlider = ({ page, pageCount, direction, onSlide }: PageSliderProps) => {
  const isRightToLeft = direction === 'rtl'
  const max = Math.max(pageCount - 1, 0)

  /** 슬라이더의 값과 페이지 번호를 서로 옮긴다. 자기 역함수라 양쪽에 같은 것을 쓴다. */
  const turn = (value: number): number => (isRightToLeft ? max - value : value)

  const value = turn(page)
  const fraction = max === 0 ? 0 : value / max

  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const slideTo = (nextValue: number) => {
    if (nextValue !== value) onSlide(turn(nextValue))
  }

  /** 포인터가 놓인 가로 자리를 값으로 읽는다. 트랙 밖이면 가까운 끝이다. */
  const valueAt = (clientX: number): number => {
    const box = trackRef.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0) return value
    return Math.round(clamp((clientX - box.left) / box.width, 1) * max)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
    thumbRef.current?.focus()
    slideTo(valueAt(event.clientX))
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (isDragging) slideTo(valueAt(event.clientX))
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsDragging(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = valueForKey(event.key, value, max)
    if (next === undefined) return
    event.preventDefault()
    slideTo(next)
  }

  return (
    <div
      className="relative flex h-6 flex-1 touch-none items-center select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 트랙이 깔고 채움이 덮는다. 읽는 방향이 뒤집히면 두 색이 자리를 바꾼다. */}
      <div
        ref={trackRef}
        data-slider-track=""
        className={clsx(
          'relative h-1.5 w-full rounded-full',
          isRightToLeft ? 'bg-accent' : 'bg-edge',
        )}
      >
        <div
          data-slider-fill=""
          className={clsx(
            'absolute inset-y-0 left-0 h-full rounded-full',
            isRightToLeft ? 'bg-edge' : 'bg-accent',
          )}
          style={{ width: percent(fraction), pointerEvents: 'none' }}
        />
      </div>
      <div
        ref={thumbRef}
        role="slider"
        tabIndex={0}
        aria-label="Page"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`Page ${turn(value) + 1}`}
        data-dragging={isDragging ? '' : undefined}
        className="absolute h-4 w-4 -translate-x-1/2 cursor-grab touch-none rounded-full border-2 border-accent bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-dragging:cursor-grabbing"
        style={{ left: percent(fraction) }}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
