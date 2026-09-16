/**
 * 리더의 크롬. 위의 헤더(메뉴바와 카운터와 지금 값)와 아래의 넘김 줄을 함께 세운다.
 *
 * 스스로 숨지 않고, 손으로 숨기면 둘이 함께 화면에서 빠진다(`R-251`, `R-252`).
 * 흐리게 두지 않고 아예 그리지 않는 이유는 자리를 차지한 채 투명해지면
 * 스테이지가 그대로 작기 때문이다.
 */

import type { ReactNode } from 'react'
import { useRef } from 'react'

import { ReaderFooter } from './footer.tsx'
import { FIT_LABEL, ReaderMenubar } from './menubar.tsx'
import type { ChromeProps, ChromeState } from './types.ts'

/**
 * 긴 파일 이름을 줄일 때 남길 글자 수. 한 장이면 넉넉하고, 두 장이면 둘이 나란히
 * 서야 하므로 절반씩이다.
 */
const nameTailFor = (count: number): number => (count > 1 ? 12 : 24)

/**
 * 이름을 꼬리부터 남기고 앞을 줄인다.
 *
 * 줄일 곳이 앞인 이유는 스캔본의 이름이 대개 `Vol.01 Ch.003 - 045.jpg`처럼 공통된
 * 머리에 번호가 붙는 꼴이기 때문이다. 뒤를 자르면 남는 것이 페이지마다 똑같은
 * 머리뿐이라, 정렬을 확인하려고 띄운 이름이 아무것도 말해 주지 않는다(`R-217`).
 */
const clipStart = (name: string, tail: number): string =>
  name.length <= tail ? name : `…${name.slice(-(tail - 1))}`

/**
 * 카운터 자리. 몇 번째 장인지 위에, 그것이 어느 파일인지 아래에 둔다.
 *
 * 카운터가 헤더의 첫 `span`이어야 한다 — e2e가 그것으로 지금 자리를 읽는다. 그래서
 * 이것이 헤더의 첫 자식 안에서도 맨 앞이고, 눈에 보이는 차례는 `order`가 맡아
 * 메뉴바를 왼쪽에 둔다.
 */
const Counter = ({
  counter,
  fileNames,
}: Readonly<{ counter: string; fileNames: ReadonlyArray<string> }>) => {
  const tail = nameTailFor(fileNames.length)
  const names = fileNames.map((name) => clipStart(name, tail)).join(' · ')

  return (
    <div className="flex min-w-0 flex-col items-center">
      <span className="text-sm text-muted">{counter}</span>
      {names === '' ? null : (
        <span className="max-w-[28ch] truncate text-xs text-muted/70" title={fileNames.join(' · ')}>
          {names}
        </span>
      )}
    </div>
  )
}

/**
 * 지금 걸린 값들을 읽는 차례대로 적는다. 읽는 방향, 한 장인지 두 장인지, 맞춤
 * 모드, 그리고 돌고 있을 때만 슬라이드쇼다.
 *
 * 멈춘 슬라이드쇼를 적지 않는 이유는 그것이 늘 그런 상태이기 때문이다 — 언제나
 * 서 있는 글자는 읽히지 않고 줄만 길게 만든다.
 */
const statusParts = (state: ChromeState): ReadonlyArray<string> => [
  state.direction === 'rtl' ? 'RTL' : 'LTR',
  state.view === 'spread' ? 'Two' : 'One',
  FIT_LABEL[state.fit],
  ...(state.isPlaying ? ['Playing'] : []),
]

/**
 * 카운터 옆에 붙는 지금 값 한 줄(`R-221`, `R-224`). 예전 툴바가 버튼 글자로 늘
 * 보여 주던 것이다.
 *
 * 메뉴 안의 곁글과 달리 `aria-hidden`이 아니다. 값이 메뉴 안으로 접히면서 메뉴를
 * 열기 전에는 보이지 않고 보조기기는 아예 닿지 못하게 됐는데, 이 줄이 그 둘을
 * 함께 되돌린다.
 *
 * `role="status"`인 이유는 값을 바꾸는 항목이 눌리는 순간 메뉴와 함께 사라져,
 * 무엇으로 바뀌었는지 말해 줄 자리가 달리 없기 때문이다. 이름을 다는 것은 Astryx의
 * 버튼마다 제 것인 빈 `status`가 하나씩 딸려 있어서다 — 이름이 없으면 이 줄을
 * 그것들과 가려낼 길이 없다.
 */
const ReaderStatus = ({ state }: Readonly<{ state: ChromeState }>) => (
  <p role="status" aria-label="Reading state" className="text-xs whitespace-nowrap text-muted/70">
    {statusParts(state).join(' · ')}
  </p>
)

/** 리더 위쪽 줄. 메뉴바와, 카운터와 지금 값이 여기 선다. */
export const ReaderHeader = ({
  state,
  actions,
  onFocusGoToPage,
}: ChromeProps & Readonly<{ onFocusGoToPage?: () => void }>) => (
  <header className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
    <div className="order-2 mx-auto flex min-w-0 items-center gap-3">
      <Counter counter={state.counter} fileNames={state.fileNames} />
      <ReaderStatus state={state} />
    </div>
    <div className="order-1">
      <ReaderMenubar state={state} actions={actions} onFocusGoToPage={onFocusGoToPage} />
    </div>
  </header>
)

/**
 * 헤더와 푸터를 세우고 그 사이에 스테이지를 끼운다. 리더는 이것 하나만 걸면 된다.
 *
 * 스테이지를 자식으로 받는 이유는 셋이 위에서 아래로 쌓여야 하기 때문이다. 크롬이
 * 숨으면 헤더와 푸터만 빠지고 스테이지가 그 높이를 가져간다(`R-252`).
 *
 * 번호를 적는 입력란은 푸터에 있고 그리로 보내는 항목은 메뉴에 있어서, 둘을 잇는
 * ref를 여기서 쥔다.
 */
export const ReaderChrome = ({
  state,
  actions,
  children,
}: ChromeProps & Readonly<{ children?: ReactNode }>) => {
  const goToPageRef = useRef<HTMLInputElement>(null)

  return (
    <>
      {state.isChromeVisible ? (
        <ReaderHeader
          state={state}
          actions={actions}
          onFocusGoToPage={() => goToPageRef.current?.focus()}
        />
      ) : null}
      {children}
      {state.isChromeVisible ? (
        <ReaderFooter state={state} actions={actions} goToPageRef={goToPageRef} />
      ) : null}
    </>
  )
}
