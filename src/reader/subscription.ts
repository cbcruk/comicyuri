/**
 * 리더가 브라우저에서 듣는 것. Foldkit의 `Subscription`이 스트림으로 엮어 두던 것을,
 * 이벤트 하나를 Message로 옮기는 함수들로 풀어 둔 자리다.
 *
 * 리스너를 걸고 떼는 일은 화면 쪽 훅이 맡는다. 무엇을 들을지와 그것이 무엇을
 * 뜻하는지만 여기 남으므로, 듣는 규칙은 화면이 React로 바뀌어도 그대로다.
 *
 * `pointerId`와 `ctrlKey`, `deltaY`는 요소 단위 핸들러에 실려 오지 않고, 드래그는
 * 포인터가 시작한 페이지를 벗어난 뒤에도 계속 따라가야 한다. 그래서 이 모두를
 * 뷰가 아니라 document에서 읽는다.
 */

import { Option } from 'effect'

import { PAGE_ID, STAGE_ID } from '../page/reader/constant.ts'
import { NO_ROOM, deviceFor } from '../page/reader/scroll.ts'
import type { Room } from '../page/reader/scroll.ts'
import type { Point } from '../page/reader/gesture.ts'
import { handlesKeysItself, isReaderKey } from './keys.ts'
import { Message } from './message.ts'
import type { Model } from './model.ts'

/**
 * 포인터 위치는 뷰포트 한가운데를 기준으로 전한다. pan 오프셋이 이미 쓰는
 * 원점이라서, update는 페이지 크기를 알 필요가 없다.
 */
const centreRelative = (event: PointerEvent | WheelEvent): Point => ({
  x: event.clientX - window.innerWidth / 2,
  y: event.clientY - window.innerHeight / 2,
})

/**
 * 마우스 휠인지 트랙패드인지를 가르는 옛 값. 표준이 아니라 `WheelEvent`의 타입에
 * 없고, 주지 않는 브라우저도 있다.
 */
const wheelDeltaOf = (event: WheelEvent & { wheelDeltaY?: number }): number | undefined =>
  event.wheelDeltaY

/** 누름은 툴바가 아니라 페이지 위에 떨어졌을 때만 친다. */
const isOnStage = (event: Event): boolean =>
  event.target instanceof Element && event.target.closest(`#${STAGE_ID}`) !== null

/**
 * 페이지가 굴러다닐 수 있는 자리의 화면 좌표. 스테이지에서 여백을 뺀 안쪽이다.
 *
 * 스테이지의 상자를 쓰면 다 굴린 페이지가 여백을 8px 덮고 선다. 그렇다고 페이지를
 * 담은 상자로 재면 세운 페이지에서 틀린다. 90도나 270도로 세운 상자는 가로세로가
 * 맞바뀌어(`R-228`) 스테이지보다 한쪽으로 길고, 그러면 화면에 다 들어가는 페이지도
 * 그 방향으로 굴러간다. 스테이지 자신은 transform이 걸리지 않으므로, 굴리는 동안에도
 * 이 자리는 움직이지 않는다.
 */
const viewOnStage = (
  stage: HTMLElement,
): Readonly<{ top: number; left: number; bottom: number; right: number }> => {
  const box = stage.getBoundingClientRect()
  const style = getComputedStyle(stage)
  const top = box.top + stage.clientTop + Number.parseFloat(style.paddingTop)
  const left = box.left + stage.clientLeft + Number.parseFloat(style.paddingLeft)
  return {
    top,
    left,
    bottom: box.top + stage.clientTop + stage.clientHeight - Number.parseFloat(style.paddingBottom),
    right: box.left + stage.clientLeft + stage.clientWidth - Number.parseFloat(style.paddingRight),
  }
}

/**
 * 지금 걸려 있는 페이지가 화면 밖으로 나가 있는 몫. 굴림이 어디까지 갈 수 있는지가
 * 곧 이 값이다.
 *
 * 재는 것은 페이지를 담은 상자가 아니라 그 안에 놓인 것들이다. 상자는 스테이지만
 * 하게(세웠다면 가로세로를 맞바꾸어) 잡혀 있고 (맞춤 모드가 퍼센트로 풀리려면 그래야
 * 한다) 화면보다 큰 페이지는 그 상자 밖으로 넘쳐 나가므로, 상자를 재면 언제나 갈
 * 곳이 없다고 나온다.
 *
 * `getBoundingClientRect`는 transform까지 적용된 자리를 주므로, 확대와 이동이
 * 걸린 값이 그대로 나온다.
 *
 * 넘긴 페이지가 아직 서지 않았으면 이 값을 쓰지 않고 {@linkcode NO_ROOM}을
 * 보낸다(`R-207`). 그동안 화면에 남아 있는 것은 이전 페이지라, 여기서 잰 거리는
 * 다음 페이지에 대한 사실이 아니다.
 */
export const roomOnStage = (): Room => {
  const stage = document.getElementById(STAGE_ID)
  const page = document.getElementById(PAGE_ID)
  if (stage === null || page === null) return NO_ROOM

  const boxes = Array.from(page.children, (child) => child.getBoundingClientRect())
  if (boxes.length === 0) return NO_ROOM

  const view = viewOnStage(stage)

  const room = (edge: number): number => Math.max(0, edge)

  return {
    up: room(view.top - Math.min(...boxes.map((box) => box.top))),
    down: room(Math.max(...boxes.map((box) => box.bottom)) - view.bottom),
    left: room(view.left - Math.min(...boxes.map((box) => box.left))),
    right: room(Math.max(...boxes.map((box) => box.right)) - view.right),
  }
}

/**
 * 키 누름이 리더의 것인지 보고, 그렇다면 브라우저에서 빼앗는다.
 *
 * 가져가겠다는 결정과 그것을 관철하는 `preventDefault`는 브라우저가 이벤트를
 * 흘리는 것과 같은 동기 턴 안에서 일어나야 한다. 뒤에서 결정하면 리더가 보기도
 * 전에 Space로 페이지가 스크롤되고, 모든 키를 가져가면 Ctrl+R까지 삼킨다.
 */
export const messageForKeydown = (event: KeyboardEvent): Option.Option<Message> => {
  if (handlesKeysItself(event.target)) return Option.none()

  if (!isReaderKey(event.key, { ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey })) {
    return Option.none()
  }

  event.preventDefault()
  return Option.some(Message.PressedKey({ key: event.key, withShift: event.shiftKey }))
}

/** 페이지 위에 떨어진 누름만 제스처가 된다. */
export const messageForPointerDown = (event: PointerEvent): Option.Option<Message> =>
  isOnStage(event)
    ? Option.some(Message.PressedPointer({ pointerId: event.pointerId, at: centreRelative(event) }))
    : Option.none()

/** 누른 포인터가 움직였다. */
export const messageForPointerMove = (event: PointerEvent): Message =>
  Message.MovedPointer({ pointerId: event.pointerId, at: centreRelative(event) })

/** 포인터를 뗐다. 어디서 뗐는지와 언제 뗐는지가 탭을 가른다. */
export const messageForPointerUp = (event: PointerEvent): Message =>
  Message.ReleasedPointer({
    pointerId: event.pointerId,
    at: centreRelative(event),
    timeStamp: event.timeStamp,
    viewportWidth: window.innerWidth,
  })

/** 브라우저가 누름을 거두었다. */
export const messageForPointerCancel = (event: PointerEvent): Message =>
  Message.CancelledPointer({ pointerId: event.pointerId })

/**
 * 굴림. 트랙패드 핀치와 마우스 줌은 둘 다 Ctrl+휠로 도착하므로 여기서 갈린다.
 *
 * 페이지 위의 굴림은 브라우저에서 빼앗는다. 그러지 않으면 문서가 함께 스크롤된다.
 *
 * @param room 지금 페이지가 갈 수 있는 거리. 다음 스프레드가 아직 서지 않았으면
 * 부르는 쪽이 {@linkcode NO_ROOM}을 넘긴다(`R-207`).
 */
export const messageForWheel = (event: WheelEvent, room: Room): Option.Option<Message> => {
  if (!isOnStage(event)) return Option.none()

  event.preventDefault()

  if (event.ctrlKey) {
    return Option.some(Message.ScrolledToZoom({ delta: event.deltaY, at: centreRelative(event) }))
  }

  return Option.some(
    Message.ScrolledStage({
      delta: { x: event.deltaX, y: event.deltaY },
      room,
      device: deviceFor({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        wheelDeltaY: wheelDeltaOf(event),
      }),
    }),
  )
}

/**
 * 제스처가 열린 채로 페이지를 만질 수 없게 되었다. 창이 포커스를 잃거나 탭이 뒤로
 * 넘어가면 놓음이 끝내 오지 않을 수 있고, 그러면 돌아왔을 때도 제스처가 열린 채라서
 * 다음 누름이 낡은 지점을 상대로 한 두 번째 손가락으로 읽힌다.
 */
export const messageForAbandon = (): Message => Message.AbandonedPointer()

/** document가 전체화면 상태가 바뀌었다고 알렸다. */
export const messageForFullscreenChange = (): Message =>
  Message.ChangedFullscreen({ isFullscreen: document.fullscreenElement !== null })

/** 창 너비가 바뀌었다. 격자가 열려 있는 동안에만 듣는다. */
export const messageForResize = (): Message =>
  Message.MeasuredThumbsWidth({ width: window.innerWidth })

/** 이동과 놓음은 제스처가 살아 있는 동안에만 존재한다. */
export const isGesturing = (model: Model): boolean => model.gesture._tag !== 'Idle'

/**
 * 슬라이드쇼가 다음 장을 기다리는 시간(초). 돌고 있지 않으면 없음이다.
 *
 * 기다리는 것을 페이지와 반쪽에 매어 둔다. 그래야 넘어간 순간부터 다시 세고, 사람이
 * 손으로 넘긴 뒤에도 처음부터 센다 — 넘어가자마자 또 넘어가는 일이 없다. 반씩
 * 읽는 페이지에서 반쪽을 옮기는 것도 넘김이다.
 */
export const slideshowSeconds = (model: Model): Option.Option<number> =>
  model.isPlaying ? Option.some(model.settings.slideSeconds) : Option.none()
