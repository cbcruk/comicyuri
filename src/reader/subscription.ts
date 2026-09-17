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

import { PAGE_ID, STAGE_ID } from '../reader/constant.ts'
import { EDGE_SLACK, NO_ROOM, deviceFor } from '../reader/scroll.ts'
import type { Room } from '../reader/scroll.ts'
import type { Point } from '../reader/gesture.ts'
import type { Half } from '../reader/half.ts'
import { handlesKeysItself, isReaderKey } from './keys.ts'
import { Message } from './message.ts'
import type { Model } from './model.ts'

/**
 * 포인터 위치는 스테이지 한가운데를 기준으로 전한다. pan 오프셋이 이미 쓰는
 * 원점이라서, update는 페이지 크기를 알 필요가 없다.
 *
 * 창 가운데가 아니라 스테이지 가운데인 것은 확대가 그 자리를 중심으로 일어나기 때문이다. 둘은
 * 스테이지 위아래의 크롬 높이가 같을 때만 겹친다 — 푸터가 헤더보다 크거나 이어 읽기 줄이 떠
 * 있으면, 창 가운데로 재는 순간 손가락 사이 지점이 그 차이의 절반만큼 미끄러진다(`R-233`).
 * 스테이지가 아직 없으면(리더가 서기 전) 창 가운데로 잰다.
 */
const centreRelative = (event: PointerEvent | WheelEvent): Point => {
  const stage = document.getElementById(STAGE_ID)
  const box = stage?.getBoundingClientRect()
  const centreX = box === undefined ? window.innerWidth / 2 : box.left + box.width / 2
  const centreY = box === undefined ? window.innerHeight / 2 : box.top + box.height / 2

  return { x: event.clientX - centreX, y: event.clientY - centreY }
}

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
 * **이 함수는 재기만 한다. 재도 되는 때인지는 부르는 쪽이 안다.** 넘긴 스프레드가 아직
 * 서지 않았으면 화면에 남아 있는 것은 이전 페이지라, 여기서 잰 거리는 다음 페이지에
 * 대한 사실이 아니다(`R-207`) — 확대해 둔 이전 페이지의 거리로 굴리면 확대가 풀린 다음
 * 페이지가 엉뚱한 자리에 앉는다. 그동안은 이 값을 아예 재지 말고 {@linkcode NO_ROOM}을
 * {@linkcode messageForWheel}에 넘겨야 한다. 스프레드가 도착했는지를 아는 것은
 * `src/atoms/pages.ts`의 atom뿐이라, 그 답을 여기로 가져올 길은 없다.
 */
export const roomOnStage = (): Room => {
  const stage = document.getElementById(STAGE_ID)
  const page = document.getElementById(PAGE_ID)
  if (stage === null || page === null) return NO_ROOM

  const boxes = Array.from(page.children, (child) => child.getBoundingClientRect())
  if (boxes.length === 0) return NO_ROOM

  const view = viewOnStage(stage)

  /**
   * 한 변에 남은 거리. `EDGE_SLACK`보다 적게 남은 것은 끝에 닿은 것으로 친다.
   *
   * 화면에 통째로 들어간 페이지가 제 상자보다 소수점 몇 픽셀 넘치는 일이 흔하다 — 툴바
   * 높이가 `55.46875`처럼 떨어지면 맞춤된 이미지가 반올림되어 0.375px 넘친다. 그것을
   * 갈 곳으로 치면 굴림이 그 0.375px를 먹어 치우고, 넘어가야 할 굴림이 넘어가지 않는다
   * (`R-246`). 넘김을 정하는 {@linkcode turnFromEdge}가 이미 같은 값으로 봐주고 있으므로,
   * 재는 쪽도 같은 눈금을 쓴다.
   */
  const room = (edge: number): number => (edge <= EDGE_SLACK ? 0 : edge)

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
 *
 * 물러나는 관문이 둘인 것은 두 관문이 서로 다른 것을 덮기 때문이다(`R-265`).
 * {@linkcode handlesKeysItself}는 포커스가 어디에 있는지를 보므로 위젯이 조용히
 * 삼키는 키 — 메뉴의 타입어헤드 같은 것 — 까지 덮지만, 덮는 위젯의 목록을 손으로
 * 적어 두어야 한다. `defaultPrevented`는 목록 없이 "이미 누가 가져갔다"는 사실
 * 하나만 보므로, 여기 적히지 않은 위젯이 나중에 생겨도 리더가 겹쳐 반응하지
 * 않는다. 리더의 리스너는 document에 걸려 있어 언제나 맨 나중에 보고, 그래서 이
 * 시점의 `defaultPrevented`는 "앞의 누군가가 처리했다"와 같은 말이다.
 */
export const messageForKeydown = (event: KeyboardEvent): Option.Option<Message> => {
  if (event.defaultPrevented) return Option.none()
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
 * `room`을 이 함수가 스스로 재지 않고 인자로 받는 이유는 `R-207` 하나다. 넘긴
 * 스프레드가 아직 서지 않은 동안 화면에 걸려 있는 것은 이전 페이지이고, 거기서 잰
 * 거리로 굴리면 확대가 풀린 다음 페이지가 엉뚱한 자리에 앉는다. 스프레드가 도착했는지를
 * 아는 것은 `src/atoms/pages.ts`의 atom뿐이므로, 그 답은 부르는 쪽에서 내려온다.
 *
 * @param room 지금 페이지가 갈 수 있는 거리. 넘긴 스프레드가 아직 서지 않았으면
 * {@linkcode roomOnStage}로 잰 값이 아니라 반드시 {@linkcode NO_ROOM}이어야
 * 한다(`R-207`). 이 약속을 어겨도 update는 알아차리지 못한다 — 확대해 둔 이전 페이지의
 * 거리로 굴린 것과 제대로 잰 거리는 값으로 구별되지 않는다.
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

/** 이동과 놓음은 제스처가 살아 있는 동안에만 존재한다. */
export const isGesturing = (model: Model): boolean => model.gesture._tag !== 'Idle'

/**
 * 슬라이드쇼가 한 번 기다리는 일. 이 값이 달라지면 기다림을 처음부터 다시 건다.
 *
 * `seconds`만이 아니라 `page`와 `half`까지 지고 다니는 이유는 그것이 곧 "다시 세기
 * 시작한다"는 뜻이기 때문이다. 넘어간 순간부터 다시 세고, 사람이 손으로 넘긴 뒤에도
 * 처음부터 센다 — 넘어가자마자 또 넘어가는 일이 없다. 반씩 읽는 페이지에서 반쪽을
 * 옮기는 것도 넘김이다.
 */
export type SlideshowWait = Readonly<{
  /** 다음 장까지 기다리는 시간(초). */
  seconds: number
  page: number
  half: Half
}>

/**
 * 슬라이드쇼가 지금 기다리고 있는 것. 돌고 있지 않으면 없음이다.
 *
 * 값 하나를 통째로 돌려주는 것이 이 함수의 요점이다. 초만 돌려주면 그것을 의존성으로
 * 삼는 훅이 페이지가 넘어가도 타이머를 다시 걸지 않아 `R-2C1`이 소리 없이 깨진다.
 * 부르는 쪽은 이 값 전체를 타이머의 키로 삼으면 된다.
 */
export const slideshowWait = (model: Model): Option.Option<SlideshowWait> =>
  model.isPlaying
    ? Option.some({
        seconds: model.settings.slideSeconds,
        page: model.page,
        half: model.half,
      })
    : Option.none()
