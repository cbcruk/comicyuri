/**
 * 리더 아래쪽의 넘김 줄. 첫 장·이전·슬라이더·번호 입력란·다음·끝이 한 줄에 선다.
 *
 * 이 줄은 메뉴로 접지 않는다. 읽는 동안 쉬지 않고 쓰는 것들이라 한 번 더 열어야
 * 닿는 자리에 두면 읽는 일이 끊긴다.
 */

import * as stylex from '@stylexjs/stylex'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { useCallback, useRef } from 'react'
import type { Ref } from 'react'

import { colorVars } from '@astryxdesign/core/theme/tokens.stylex'

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

  // 입력란에 닿는 손잡이. 메뉴의 "Go to page"가 보낸 ref와 Enter 뒤에 놓아 주는 이 ref를 함께 건다.
  const boxRef = useRef<HTMLInputElement | null>(null)
  const attachBox = useCallback(
    (element: HTMLInputElement | null) => {
      boxRef.current = element
      if (typeof goToPageRef === 'function') goToPageRef(element)
      else if (goToPageRef != null) goToPageRef.current = element
    },
    [goToPageRef],
  )

  return (
    <HStack
      as="footer"
      align="center"
      justify="between"
      gap={2}
      paddingInline={4}
      paddingBlock={2}
      xstyle={[styles.footer, isRightToLeft && styles.rightToLeft]}
    >
      <Button label="First" variant="secondary" size="sm" onClick={actions.onFirst} />
      <Button label="Previous" variant="secondary" size="sm" onClick={actions.onPrevious} />
      <PageSlider
        page={state.page}
        pageCount={state.pageCount}
        direction={state.direction}
        onSlide={actions.onSlide}
      />
      {/*
        적은 번호는 Enter를 누르거나 입력란을 떠날 때 한 번 넘어간다(`R-266`). 값을 쥐지 않으므로
        `value`는 늘 비어 있고, 지금 어디인지는 자리표시자가 말한다.

        - `min`·`max`를 주지 않는다. 주면 책 밖의 번호를 끝값으로 당겨 붙여 넘기는데, 책 밖의
          번호는 아무 일도 일으키지 않아야 한다. 가르는 것은 리더의 `update`다.
        - 휠과 위·아래 화살표로 값을 한 칸씩 옮기는 것을 끈다. 옮길 때마다 곧바로 넘어가서,
          다 적은 뒤의 한 번이라는 약속이 깨진다.
        - Enter를 누르면 입력란을 떠난다. `NumberInput`은 넘긴 뒤에도 적은 글자를 쥐고 있다가
          떠날 때 한 번 더 넘기는데, 그 사이 다른 길로 넘겼다면 옛 번호로 되돌아간다. 떠나면 그
          글자가 거기서 끝나고, 곧바로 키로 페이지를 넘길 수 있다.
      */}
      <NumberInput
        ref={attachBox}
        label="Go to page"
        isLabelHidden={true}
        size="sm"
        width={64}
        value={null}
        placeholder={String(state.page + 1)}
        isWheelEnabled={false}
        onChange={(page) => actions.onGoToPage(String(page))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault()
        }}
        onEnter={() => boxRef.current?.blur()}
      />
      <Button label="Next" variant="secondary" size="sm" onClick={actions.onNext} />
      <Button label="Last" variant="secondary" size="sm" onClick={actions.onLast} />
    </HStack>
  )
}
