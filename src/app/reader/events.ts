/**
 * 리더가 브라우저에서 듣는 것을 실제로 걸고 떼는 자리.
 *
 * 무엇을 들을지와 그것이 무엇을 뜻하는지는 `src/reader/subscription.ts`의 순수한
 * 매퍼들이 안다. 여기 남은 것은 리스너를 걸고 떼는 일과, 매퍼가 브라우저에서만 알 수
 * 있는 값을 달라고 할 때 그것을 재어 주는 일뿐이다.
 *
 * `pointerId`와 `ctrlKey`, `deltaY`는 요소 단위 핸들러에 실려 오지 않고, 드래그는
 * 포인터가 시작한 페이지를 벗어난 뒤에도 계속 따라가야 한다. 그래서 이 모두를 뷰가
 * 아니라 document에서 듣는다 — Foldkit 구독이 그랬던 것과 같다.
 */

import { Option } from 'effect'
import { useEffect, useRef } from 'react'

import { NO_ROOM } from '../../reader/scroll.ts'
import type { Room } from '../../reader/scroll.ts'
import type { Command } from '../../reader/command.ts'
import { Message } from '../../reader/message.ts'
import type { Model } from '../../reader/model.ts'
import {
  isGesturing,
  messageForAbandon,
  messageForFullscreenChange,
  messageForKeydown,
  messageForPointerCancel,
  messageForPointerDown,
  messageForPointerMove,
  messageForPointerUp,
  messageForWheel,
  roomOnStage,
  slideshowWait,
} from '../../reader/subscription.ts'

/**
 * 전체화면에 들어가거나 나가 달라고 브라우저에 묻는다.
 *
 * 거절되면 아무 일도 일어나지 않고 상태도 바뀌지 않으므로 그것으로 맞다. 받아들여지면
 * document가 `fullscreenchange`로 알리고, 그때 `ChangedFullscreen`이 들어온다.
 */
const askFullscreen = (wantFullscreen: boolean): void => {
  const asked = wantFullscreen
    ? document.documentElement.requestFullscreen()
    : document.exitFullscreen()

  void asked.catch(() => undefined)
}

/**
 * update가 남긴 부탁 하나를 브라우저에 대고 실제로 한다.
 *
 * 격자의 폭을 재 달라는 부탁은 여기 없다. React 격자는 `ResizeObserver`로 자기 자리를
 * 스스로 재므로(`R-276`), 그 답을 Model로 돌려보낼 이유가 없다.
 */
export const runCommand = (command: Command): void => {
  if (command._tag === 'ToggleFullscreen') askFullscreen(command.wantFullscreen)
}

/**
 * 굴림이 갈 수 있는 거리.
 *
 * 다음 스프레드가 아직 서지 않았으면 재지 않는다. 그동안 화면에 남아 있는 것은 이전
 * 페이지라, 거기서 잰 거리는 지금 페이지에 대한 사실이 아니다 — 확대해 둔 이전 페이지의
 * 거리로 굴리면 확대가 풀린 다음 페이지가 엉뚱한 자리에 앉는다(`R-207`).
 */
const roomFor = (isSpreadReady: boolean): Room => (isSpreadReady ? roomOnStage() : NO_ROOM)

/** 매퍼가 돌려준 Message가 있으면 보낸다. */
const sendMaybe = (send: (message: Message) => void, maybe: Option.Option<Message>): void => {
  if (Option.isSome(maybe)) send(maybe.value)
}

/** {@linkcode useReaderEvents}가 받는 것. */
export type ReaderEvents = Readonly<{
  /** Message 하나를 리더에 접어 넣는다. 렌더마다 바뀌지 않아야 한다. */
  send: (message: Message) => void
  model: Model
  /**
   * 지금 스프레드가 그릴 수 있게 되었는지. 거짓이면 굴림에 잰 거리 대신
   * {@linkcode NO_ROOM}이 실린다(`R-207`).
   */
  isSpreadReady: boolean
}>

/**
 * 리더가 듣는 모든 것을 걸어 둔다. document의 키보드·포인터·휠, 창의 포커스,
 * 전체화면 상태다.
 *
 * 리스너는 한 번만 걸고 지금 값은 ref로 읽는다. 렌더마다 떼었다 다시 거는 것을 피하는
 * 것이기도 하지만, 그보다 `wheel`을 `passive: false`로 다시 거는 사이에 굴림이 하나
 * 지나가면 그 굴림만 브라우저의 것이 되기 때문이다.
 */
export const useReaderEvents = ({ send, model, isSpreadReady }: ReaderEvents): void => {
  const latest = useRef({ model, isSpreadReady })
  useEffect(() => {
    latest.current = { model, isSpreadReady }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // 설정 패널이 열려 있는 동안 Escape는 패널의 것이다. Astryx `Dialog`가 스스로
      // 닫으면서 `ClickedToggleSettings`를 보내므로, 여기서 또 한 겹 벗기면 한 번 누른
      // Escape가 두 겹을 벗긴다 — 패널이 닫히고 그 뒤에서 격자까지 함께 닫힌다(`R-2A3`).
      //
      // 지금 Astryx는 그 Escape를 dialog에서 멈춰 세워 여기까지 흘리지 않는다. 그래도
      // 이 줄을 두는 이유는 그것이 문서로 약속된 동작이 아니기 때문이다 — 한 겹만
      // 벗긴다는 규칙은 리더가 스스로 지켜야 한다.
      if (event.key === 'Escape' && latest.current.model.isSettingsOpen) return

      sendMaybe(send, messageForKeydown(event))
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [send])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      sendMaybe(send, messageForPointerDown(event))
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [send])

  // 이동과 놓음은 제스처가 살아 있는 동안에만 존재한다. 그래서 페이지를 건드리지 않는
  // 사람에게는 아무 값도 들지 않는다.
  const gesturing = isGesturing(model)
  useEffect(() => {
    if (!gesturing) return

    const onMove = (event: PointerEvent): void => send(messageForPointerMove(event))
    const onUp = (event: PointerEvent): void => send(messageForPointerUp(event))
    const onCancel = (event: PointerEvent): void => send(messageForPointerCancel(event))
    // 창이 포커스를 잃거나 탭이 뒤로 넘어가면 놓음이 끝내 오지 않을 수 있다.
    const onAbandon = (): void => send(messageForAbandon())
    const onVisibility = (): void => {
      if (document.hidden) send(messageForAbandon())
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onAbandon)

    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onAbandon)
    }
  }, [gesturing, send])

  useEffect(() => {
    const onWheel = (event: WheelEvent): void => {
      sendMaybe(send, messageForWheel(event, roomFor(latest.current.isSpreadReady)))
    }

    // 페이지 위의 굴림은 브라우저에서 빼앗아야 하고, `passive`인 리스너는 그럴 수 없다.
    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [send])

  useEffect(() => {
    const onChange = (): void => send(messageForFullscreenChange())

    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [send])
}

/**
 * 슬라이드쇼. 정해 둔 시간이 지나면 한 장 넘긴다(`R-2C1`).
 *
 * 기다림을 페이지와 반쪽에 매어 둔다. 그래야 넘어간 순간부터 다시 세고, 사람이 손으로
 * 넘긴 뒤에도 꽉 찬 시간을 받는다 — 넘어가자마자 또 넘어가는 일이 없다. 넓은 페이지를
 * 반씩 읽는 중이면 반쪽을 옮기는 것도 한 번의 넘김이다.
 */
export const useSlideshow = (send: (message: Message) => void, model: Model): void => {
  // 기다림의 정체를 통째로 의존성에 편다. 초만 보면 페이지가 넘어가도 타이머가 다시
  // 걸리지 않아, 넘어간 페이지가 남은 시간만 받는다.
  const maybeWait = slideshowWait(model)
  const seconds = Option.match(maybeWait, { onNone: () => 0, onSome: (wait) => wait.seconds })
  const page = Option.match(maybeWait, { onNone: () => -1, onSome: (wait) => wait.page })
  const half = Option.match(maybeWait, { onNone: () => 'first', onSome: (wait) => wait.half })
  const isPlaying = Option.isSome(maybeWait)

  useEffect(() => {
    if (!isPlaying) return

    const timer = window.setTimeout(() => send(Message.ElapsedSlide()), seconds * 1000)
    return () => window.clearTimeout(timer)
  }, [isPlaying, seconds, page, half, send])
}
