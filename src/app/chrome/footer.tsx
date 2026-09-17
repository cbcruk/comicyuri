/**
 * 리더 아래쪽의 넘김 줄. 첫 장·이전·슬라이더·번호 입력란·다음·끝이 한 줄에 선다.
 *
 * 이 줄은 메뉴로 접지 않는다. 읽는 동안 쉬지 않고 쓰는 것들이라 한 번 더 열어야
 * 닿는 자리에 두면 읽는 일이 끊긴다.
 */

import * as stylex from '@stylexjs/stylex'
import { Button } from '@astryxdesign/core/Button'
import type { KeyboardEvent, Ref } from 'react'

import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from '@astryxdesign/core/theme/tokens.stylex'

import { GOTO_ID } from '../../reader/constant.ts'
import { PageSlider } from './slider.tsx'
import type { ChromeActions, ChromeState } from './types.ts'

/** 넘김 줄의 모양. */
const styles = stylex.create({
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-4'],
    paddingBlock: spacingVars['--spacing-2'],
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: colorVars['--color-border'],
  },
  rightToLeft: {
    flexDirection: 'row-reverse',
  },
  goToPage: {
    // 세 자리 쪽수가 들어갈 만큼이다.
    width: '4rem',
    paddingInline: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1-5'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-gray'],
    color: colorVars['--color-text-primary'],
    fontSize: textSizeVars['--font-size-base'],
    textAlign: 'center',
    outlineStyle: { default: 'none', ':focus-visible': 'solid' },
    outlineWidth: 2,
    outlineOffset: 2,
    outlineColor: colorVars['--color-accent'],
  },
})

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
    <footer {...stylex.props(styles.footer, isRightToLeft && styles.rightToLeft)}>
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
        {...stylex.props(styles.goToPage)}
        onKeyDown={handleGoToPageKeyDown}
        onBlur={(event) => submit(event.currentTarget)}
      />
      <Button label="Next" variant="secondary" size="sm" onClick={actions.onNext} />
      <Button label="Last" variant="secondary" size="sm" onClick={actions.onLast} />
    </footer>
  )
}
