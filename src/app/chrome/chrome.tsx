/**
 * 리더의 크롬. 위의 메뉴바와 아래의 넘김 줄을 함께 세운다.
 *
 * 스스로 숨지 않고, 손으로 숨기면 둘이 함께 화면에서 빠진다(`R-251`, `R-252`).
 * 흐리게 두지 않고 아예 그리지 않는 이유는 자리를 차지한 채 투명해지면
 * 스테이지가 그대로 작기 때문이다.
 */

import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'
import { useRef } from 'react'

import { HStack } from '@astryxdesign/core/HStack'
import { colorVars } from '@astryxdesign/core/theme/tokens.stylex'

import { ReaderFooter } from './footer.tsx'
import { ReaderMenubar } from './menubar.tsx'
import type { ChromeProps } from './types.ts'

/**
 * 리더 머리의 모양. 색은 Astryx 토큰에서 온다.
 *
 * 줄 세우기와 간격은 `HStack`의 props가 맡고, 여기에는 그것이 말하지 못하는 테두리만
 * 남는다.
 */
const styles = stylex.create({
  header: {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
})

/** 리더 위쪽 줄. 메뉴바가 여기 선다. */
export const ReaderHeader = ({
  state,
  actions,
  onOpenGoToPage,
}: ChromeProps & Readonly<{ onOpenGoToPage?: () => void }>) => (
  <HStack
    as="header"
    wrap="wrap"
    align="center"
    gap={2}
    paddingInline={4}
    paddingBlock={2}
    xstyle={styles.header}
  >
    <ReaderMenubar state={state} actions={actions} onOpenGoToPage={onOpenGoToPage} />
  </HStack>
)

/**
 * 헤더와 푸터를 세우고 그 사이에 스테이지를 끼운다. 리더는 이것 하나만 걸면 된다.
 *
 * 스테이지를 자식으로 받는 이유는 셋이 위에서 아래로 쌓여야 하기 때문이다. 크롬이
 * 숨으면 헤더와 푸터만 빠지고 스테이지가 그 높이를 가져간다(`R-252`).
 *
 * 번호 창을 여는 카운터는 푸터에 있고 그것을 부르는 항목은 메뉴에 있어서, 둘을
 * 잇는 ref를 여기서 쥔다.
 */
export const ReaderChrome = ({
  state,
  actions,
  children,
}: ChromeProps & Readonly<{ children?: ReactNode }>) => {
  const goToPageRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      {state.isChromeVisible ? (
        <ReaderHeader
          state={state}
          actions={actions}
          onOpenGoToPage={() => goToPageRef.current?.click()}
        />
      ) : null}
      {children}
      {state.isChromeVisible ? (
        <ReaderFooter state={state} actions={actions} goToPageRef={goToPageRef} />
      ) : null}
    </>
  )
}
