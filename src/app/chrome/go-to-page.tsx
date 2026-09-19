/**
 * 카운터와, 그것을 누르면 열리는 번호 창(`R-213`, `R-266`).
 *
 * 입력란은 넘김 줄에 늘 서 있지 않고 Dialog 안에 산다. 지금 자리를 말하는 카운터가 곧
 * 그 자리를 옮기는 손잡이다. Go 메뉴의 "Go to page"는 이 카운터를 누른 것과 같다.
 */

import * as stylex from '@stylexjs/stylex'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from '@astryxdesign/core/theme/tokens.stylex'
import { VStack } from '@astryxdesign/core/VStack'
import { useCallback, useRef, useState } from 'react'
import type { Ref } from 'react'

/** 카운터 버튼의 모양. 크기와 색은 모두 Astryx 토큰에서 온다. */
const styles = stylex.create({
  counter: {
    flexShrink: 0,
    paddingInline: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1'],
    borderWidth: 0,
    borderRadius: radiusVars['--radius-inner'],
    backgroundColor: {
      default: 'transparent',
      ':hover': colorVars['--color-border'],
    },
    fontSize: textSizeVars['--font-size-base'],
    color: colorVars['--color-text-secondary'],
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
})

/** {@linkcode GoToPage}가 받는 것. */
export type GoToPageProps = Readonly<{
  /** 카운터에 적히는 글자. 한 장이면 `3 / 120`, 두 장이면 `4–5 / 120`이다. */
  counter: string
  /** 입력란의 자리표시자가 될 지금 페이지. `0`부터 센다. */
  page: number
  /** 책의 페이지 수. 입력란 라벨에 적을 수 있는 범위로 적힌다. */
  pageCount: number
  /** 적힌 글자 그대로. 무엇이 유효한지는 리더가 정한다(`R-266`). */
  onGoToPage: (text: string) => void
  /** 카운터 버튼. Go 메뉴의 "Go to page"가 이것을 눌러 창을 연다. */
  triggerRef?: Ref<HTMLButtonElement>
}>

/**
 * 카운터 버튼과 번호 창을 그린다.
 *
 * 번호는 Enter나 Go 버튼으로만 넘어간다. Escape·Cancel·바깥 클릭으로 닫는 것은 물리는
 * 것이다 — 창을 닫는 손짓이 페이지를 옮기면 무를 길이 없다. 그래서 `NumberInput`의
 * `onChange`(떠날 때도 불린다)는 쓰지 않고, 넘기는 순간의 글자를 직접 읽는다.
 *
 * 입력란은 열 때마다 새로 세운다(`key`). 닫았다 다시 열면 빈 입력란에서 시작한다.
 *
 * 닫히면 포커스를 카운터로 돌려준다. Dialog는 그것을 하지 않아 포커스가 문서로 떨어지는데,
 * 그러면 Tab 한 번으로 돌아올 자리를 잃는다. 창이 닫히는 것은 그 뒤라 한 프레임 기다린다.
 *
 * - `min`·`max`를 주지 않는다. 주면 책 밖의 번호를 끝값으로 당겨 붙여 넘기는데, 책 밖의
 *   번호는 아무 일도 일으키지 않아야 한다. 가르는 것은 리더의 `update`다.
 * - 휠과 위·아래 화살표로 값을 한 칸씩 옮기는 것을 끈다. 적는 중에 값이 손 밖에서
 *   움직이면 다 적은 뒤의 한 번이라는 약속이 흐려진다.
 */
export const GoToPage = ({ counter, page, pageCount, onGoToPage, triggerRef }: GoToPageProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [openings, setOpenings] = useState(0)
  const boxRef = useRef<HTMLInputElement>(null)
  const counterRef = useRef<HTMLButtonElement | null>(null)

  const attachCounter = useCallback(
    (element: HTMLButtonElement | null) => {
      counterRef.current = element
      if (typeof triggerRef === 'function') triggerRef(element)
      else if (triggerRef != null) triggerRef.current = element
    },
    [triggerRef],
  )

  const changeOpen = (open: boolean) => {
    if (open) setOpenings((count) => count + 1)
    setIsOpen(open)
    if (!open) requestAnimationFrame(() => counterRef.current?.focus())
  }

  const submit = () => {
    onGoToPage(boxRef.current?.value ?? '')
    changeOpen(false)
  }

  return (
    <>
      <button
        ref={attachCounter}
        type="button"
        data-counter=""
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => changeOpen(true)}
        {...stylex.props(styles.counter)}
      >
        {counter}
      </button>
      <Dialog
        isOpen={isOpen}
        onOpenChange={changeOpen}
        purpose="info"
        width={320}
        aria-label="Go to page"
      >
        {/*
          창을 닫는 Escape가 문서까지 올라가면 리더가 그것을 책을 떠나라는 뜻으로 읽는다. 입력란의
          키는 리더가 스스로 양보하지만, Cancel·Go 버튼 위의 키는 그렇지 않다. Dialog는 Escape를
          제 `cancel`로 닫으므로 네이티브 전파만 멈춘다.
        */}
        <div
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.nativeEvent.stopPropagation()
          }}
        >
          <VStack gap={4}>
            <DialogHeader title="Go to page" onOpenChange={changeOpen} />
            <NumberInput
              key={openings}
              ref={boxRef}
              label={`Page (1–${pageCount})`}
              hasAutoFocus={true}
              value={null}
              placeholder={String(page + 1)}
              isWheelEnabled={false}
              onChange={ignoreUntilSubmit}
              onKeyDown={(event) => {
                // Enter로 닫히면 포커스가 카운터 버튼으로 돌아가는데, 기본 동작이 살아 있으면 같은
                // Enter가 그 버튼을 눌러 창을 도로 연다.
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter') {
                  event.preventDefault()
                }
              }}
              onEnter={submit}
            />
            <HStack justify="end" gap={2}>
              <Button label="Cancel" variant="secondary" onClick={() => changeOpen(false)} />
              <Button label="Go" variant="primary" onClick={submit} />
            </HStack>
          </VStack>
        </div>
      </Dialog>
    </>
  )
}

/** `NumberInput`이 요구하는 `onChange`. 넘기는 것은 Enter와 Go뿐이라 여기서는 아무것도 하지 않는다. */
const ignoreUntilSubmit = (): void => {}
