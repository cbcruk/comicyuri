/**
 * 키가 뜻하는 것. `src/page/reader/keys.ts`를 이 쪽 Model과 Message에 맞춰 옮긴
 * 것이다.
 *
 * 내용은 한 글자도 다르지 않다. 원본이 Foldkit 쪽 Model과 Message를 가리키고 있어서
 * 옮긴 리더가 그대로 쓸 수 없었을 뿐이다. 다 옮기고 나면 원본이 사라지고 이것만
 * 남는다.
 */

import { Option, Record } from 'effect'

import { SKIP_PAGES } from '../reader/constant.ts'
import { Message } from './message.ts'
import type { Model } from './model.ts'

/**
 * 리더가 가져가는 키를 한곳에 모은 것. 두 곳이 같은 답을 필요로 하기 때문이다.
 * `update`는 키가 뜻하는 Message를, 구독은 그 키를 브라우저에서 빼앗을지를
 * 알아야 한다. 이 둘을 따로 두면 리더가 Ctrl+R까지 삼키게 된다.
 */
const TURN_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ']

const COMMAND_KEYS: Readonly<Record<string, () => Message>> = {
  Home: Message.ClickedFirst,
  End: Message.ClickedLast,
  d: Message.ClickedToggleDirection,
  v: Message.ClickedToggleView,
  s: Message.ClickedToggleBinding,
  f: Message.ClickedToggleFullscreen,
  h: Message.ClickedToggleChrome,
  t: Message.ClickedToggleThumbs,
  ',': Message.ClickedToggleSettings,
  b: Message.ClickedToggleBookmark,
  r: Message.ClickedRotate,
  p: Message.ClickedToggleSlideshow,
  ']': () => Message.ClickedStepBookmark({ step: 1 }),
  '[': () => Message.ClickedStepBookmark({ step: -1 }),
  '+': Message.ClickedZoomIn,
  '-': Message.ClickedZoomOut,
}

/**
 * 키를 스스로 처리하는 위젯을 고르는 선택자.
 *
 * 역할로 세는 이유는 그것이 "이 키는 내 것"이라고 위젯이 내건 간판이기 때문이다.
 * 메뉴는 화살표로 항목 사이를 걷고, 아래 화살표와 Space로 열리고, 글자 하나로
 * 항목을 찾는다(타입어헤드) — `h`나 `t` 같은 글자까지 메뉴의 키다. 이 가운데
 * 타입어헤드는 `preventDefault`를 부르지 않으므로 {@linkcode messageForKeydown}의
 * `defaultPrevented` 관문으로는 걸리지 않는다. 그래서 두 관문이 함께 선다.
 *
 * `menubar`와 `menu`까지 세는 것은 포커스가 항목이 아니라 그 그릇에 있는 순간
 * (메뉴가 막 열려 아직 아무 항목도 잡지 않은 때)을 덮기 위한 것이다.
 */
const SELF_HANDLED = [
  'input',
  '[role="slider"]',
  '[role="menubar"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
].join(', ')

/**
 * 키가 눌린 자리의 요소가 그 키를 스스로 처리하는지. 페이지 슬라이더는 화살표와
 * Home·End, 페이지 키를 가져가고 리더의 리스너는 document에 걸려 있어서, 이것이
 * 없으면 한 번 누른 키에 둘 다 반응한다 — 같은 방향으로 두 페이지가 넘어가거나,
 * 오른쪽에서 왼쪽으로 읽는 중이라면 서로 밀어낸다.
 *
 * 입력란도 마찬가지다. 번호를 적는 동안 화살표와 Space는 글자를 옮기는 키이지
 * 페이지를 넘기는 키가 아니다.
 *
 * 메뉴바도 같은 자리에 선다. 예전 툴바는 평범한 버튼 열넷이라 키를 가져가지
 * 않았지만, 지금 그 자리는 `menubar` 하나와 `menuitem`들이다 — 양보하지 않으면
 * 메뉴 안을 걸어 다니는 것만으로 읽던 자리가 움직인다(`R-265`).
 */
export const handlesKeysItself = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(SELF_HANDLED) !== null

/** 키를 누를 때 함께 눌려 있던 수정키. */
export type Modifiers = Readonly<{
  /** Control이 눌려 있었는지. */
  ctrl: boolean
  /** Command 또는 Windows 키가 눌려 있었는지. */
  meta: boolean
  /** Alt 또는 Option이 눌려 있었는지. */
  alt: boolean
}>

/**
 * 이 키가 애초에 리더의 것인지. 수정키와 함께 눌린 키는 브라우저의 것이다 —
 * Ctrl+R은 새로고침, Cmd+F는 찾기 — 리더는 그런 것을 결코 가져가지 않는다.
 */
export const isReaderKey = (key: string, modifiers: Modifiers): boolean => {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) return false
  return key === 'Escape' || TURN_KEYS.includes(key) || Record.has(COMMAND_KEYS, key)
}

/**
 * 키가 뜻하는 Message를 Model에 비추어 정한다. 단축키는 같은 일을 하는 버튼이
 * 보내는 Message로 풀리므로, 키와 버튼이 서로 어긋날 수 없다.
 *
 * 넘김 키는 눈에 보이는 방향을 따른다. 오른쪽에서 왼쪽으로 읽을 때는 왼쪽 키가
 * 앞으로 가고, 그래야 만화를 넘기는 감각이 맞는다.
 *
 * Shift는 리더가 자기 것으로 쓰는 유일한 수정키다. 같은 넘김 키를 크게 만든다 —
 * 한 장 대신 한 뭉치. Space만은 예외로, 예부터 Shift와 함께라면 뒤로 가는 키다.
 */
export const messageForKey = (
  model: Model,
  key: string,
  withShift: boolean,
): Option.Option<Message> => {
  // Escape는 늘 책을 떠나는 대신 한 겹씩 벗긴다.
  if (key === 'Escape') {
    if (model.isSettingsOpen) return Option.some(Message.ClickedToggleSettings())
    if (model.isThumbsOpen) return Option.some(Message.ClickedToggleThumbs())
    if (model.isPlaying) return Option.some(Message.ClickedToggleSlideshow())
    if (model.isFullscreen) return Option.some(Message.ClickedToggleFullscreen())
    return Option.some(Message.ClickedExit())
  }

  const rtl = model.settings.direction === 'rtl'
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const back = rtl ? 'ArrowRight' : 'ArrowLeft'
  const goesForward = key === forward || key === 'ArrowDown' || key === 'PageDown'
  const goesBack = key === back || key === 'ArrowUp' || key === 'PageUp'

  if (withShift) {
    if (key === ' ') return Option.some(Message.ClickedPrevious())
    if (goesForward) return Option.some(Message.ClickedSkip({ pages: SKIP_PAGES }))
    if (goesBack) return Option.some(Message.ClickedSkip({ pages: -SKIP_PAGES }))
  }

  if (goesForward || key === ' ') return Option.some(Message.ClickedNext())
  if (goesBack) return Option.some(Message.ClickedPrevious())

  return Option.map(Record.get(COMMAND_KEYS, key), (toMessage) => toMessage())
}
