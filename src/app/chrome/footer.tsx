/**
 * 리더 아래쪽의 넘김 줄. 슬라이더와 카운터가 한 줄에 서고, 카운터를 누르면 번호를 적는
 * 창이 열린다.
 *
 * 이 줄은 메뉴로 접지 않는다. 읽는 동안 쉬지 않고 쓰는 것들이라 한 번 더 열어야
 * 닿는 자리에 두면 읽는 일이 끊긴다. 한 장씩·끝으로 넘기는 것은 Go 메뉴와 키가 맡는다.
 */

import * as stylex from '@stylexjs/stylex'
import { HStack } from '@astryxdesign/core/HStack'
import type { Ref } from 'react'

import { colorVars } from '@astryxdesign/core/theme/tokens.stylex'

import { GoToPage } from './go-to-page.tsx'
import { PageSlider } from './slider.tsx'
import type { ChromeActions, ChromeState } from './types.ts'

/**
 * 넘김 줄의 모양. 줄 세우기와 간격은 `HStack`이 맡는다.
 *
 * 돌아서는 것은 여기 남는다. `HStack`에는 방향을 뒤집는 prop이 없다.
 */
const styles = stylex.create({
  footer: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: colorVars['--color-border'],
  },
  rightToLeft: {
    flexDirection: 'row-reverse',
  },
})

/** 푸터가 받는 것. */
export type FooterProps = Readonly<{
  state: ChromeState
  actions: ChromeActions
  /** 카운터 버튼. 메뉴의 "Go to page"가 이것을 눌러 번호 창을 연다. */
  goToPageRef?: Ref<HTMLButtonElement>
}>

/**
 * 넘김 줄을 그린다.
 *
 * 오른쪽에서 왼쪽으로 읽으면 줄 전체가 돌아선다 — 카운터가 슬라이더가 다 차는 쪽, 그러니까
 * 책의 끝 쪽에 선다(`R-264`).
 */
export const ReaderFooter = ({ state, actions, goToPageRef }: FooterProps) => (
  <HStack
    as="footer"
    align="center"
    justify="between"
    gap={2}
    paddingInline={4}
    paddingBlock={2}
    xstyle={[styles.footer, state.direction === 'rtl' && styles.rightToLeft]}
  >
    <PageSlider
      page={state.page}
      pageCount={state.pageCount}
      direction={state.direction}
      onSlide={actions.onSlide}
    />
    <GoToPage
      counter={state.counter}
      page={state.page}
      pageCount={state.pageCount}
      onGoToPage={actions.onGoToPage}
      triggerRef={goToPageRef}
    />
  </HStack>
)
