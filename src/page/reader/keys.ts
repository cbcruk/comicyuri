import { Option, Record } from 'effect'

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
  t: Message.ClickedToggleThumbs,
  ',': Message.ClickedToggleSettings,
  b: Message.ClickedToggleBookmark,
  '+': Message.ClickedZoomIn,
  '-': Message.ClickedZoomOut,
}

/**
 * 키가 눌린 자리의 요소가 그 키를 스스로 처리하는지. 페이지 슬라이더는 화살표와
 * Home·End, 페이지 키를 가져가고 리더의 리스너는 document에 걸려 있어서, 이것이
 * 없으면 한 번 누른 키에 둘 다 반응한다 — 같은 방향으로 두 페이지가 넘어가거나,
 * 오른쪽에서 왼쪽으로 읽는 중이라면 서로 밀어낸다.
 */
export const handlesKeysItself = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[role="slider"]') !== null

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
 */
export const messageForKey = (model: Model, key: string): Option.Option<Message> => {
  // Escape는 늘 책을 떠나는 대신 한 겹씩 벗긴다.
  if (key === 'Escape') {
    if (model.isSettingsOpen) return Option.some(Message.ClickedToggleSettings())
    if (model.isThumbsOpen) return Option.some(Message.ClickedToggleThumbs())
    if (model.isFullscreen) return Option.some(Message.ClickedToggleFullscreen())
    return Option.some(Message.ClickedExit())
  }

  const rtl = model.settings.direction === 'rtl'
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const back = rtl ? 'ArrowRight' : 'ArrowLeft'

  if (key === forward || key === 'ArrowDown' || key === 'PageDown' || key === ' ') {
    return Option.some(Message.ClickedNext())
  }
  if (key === back || key === 'ArrowUp' || key === 'PageUp') {
    return Option.some(Message.ClickedPrevious())
  }

  return Option.map(Record.get(COMMAND_KEYS, key), (toMessage) => toMessage())
}
