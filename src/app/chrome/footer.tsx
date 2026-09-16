/**
 * 리더 아래쪽의 넘김 줄. 첫 장·이전·슬라이더·번호 입력란·다음·끝이 한 줄에 선다.
 *
 * 이 줄은 메뉴로 접지 않는다. 읽는 동안 쉬지 않고 쓰는 것들이라 한 번 더 열어야
 * 닿는 자리에 두면 읽는 일이 끊긴다.
 */

import { Button } from '@astryxdesign/core/Button'
import clsx from 'clsx'
import type { KeyboardEvent, Ref } from 'react'

import { GOTO_ID } from '../../reader/constant.ts'
import { PageSlider } from './slider.tsx'
import type { ChromeActions, ChromeState } from './types.ts'

/** 푸터가 받는 것. */
export type FooterProps = Readonly<{
  state: ChromeState
  actions: ChromeActions
  /** 번호를 적는 입력란. 메뉴의 "Go to page"가 이리로 포커스를 보낸다. */
  goToPageRef?: Ref<HTMLInputElement>
}>

/**
 * 넘김 줄을 그린다.
 *
 * 오른쪽에서 왼쪽으로 읽으면 줄 전체가 돌아선다 — Next는 다음 페이지가 오는 쪽,
 * 그러니까 이제 슬라이더가 채워지기 시작하는 쪽에 선다(`R-264`).
 */
export const ReaderFooter = ({ state, actions, goToPageRef }: FooterProps) => {
  const isRightToLeft = state.direction === 'rtl'

  /**
   * 적은 번호를 넘긴다. 적는 동안이 아니라 다 적은 뒤의 한 번이므로, Enter와
   * 입력란을 떠나는 순간에만 부른다(`R-266`).
   */
  const submit = (element: HTMLInputElement) => {
    actions.onGoToPage(element.value)
    element.value = ''
  }

  const handleGoToPageKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit(event.currentTarget)
  }

  return (
    <footer
      className={clsx(
        'flex items-center justify-between gap-2 border-t border-edge px-4 py-2',
        isRightToLeft && 'flex-row-reverse',
      )}
    >
      <Button label="First" variant="secondary" size="sm" onClick={actions.onFirst} />
      <Button label="Previous" variant="secondary" size="sm" onClick={actions.onPrevious} />
      <PageSlider
        page={state.page}
        pageCount={state.pageCount}
        direction={state.direction}
        onSlide={actions.onSlide}
      />
      <input
        ref={goToPageRef}
        id={GOTO_ID}
        type="number"
        aria-label="Go to page"
        placeholder={String(state.page + 1)}
        className="w-16 rounded-lg border border-edge bg-surface-2 px-2 py-1.5 text-center text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onKeyDown={handleGoToPageKeyDown}
        onBlur={(event) => submit(event.currentTarget)}
      />
      <Button label="Next" variant="secondary" size="sm" onClick={actions.onNext} />
      <Button label="Last" variant="secondary" size="sm" onClick={actions.onLast} />
    </footer>
  )
}
