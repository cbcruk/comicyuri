/**
 * 책 한 권을 읽는 동안의 리더 전부. Model과, Message를 접어 넣는 길과, 리더가 바깥에서
 * 듣는 것과, 놓지 않고 쥐는 페이지가 모두 여기 atom으로 선다.
 *
 * Foldkit 리더는 이 일을 `subscriptions`와 런타임에 맡겼다. 무엇을 들을지는 Model에서
 * 셈한 선언 하나였고, 걸고 떼는 것은 런타임의 몫이었다. React로 옮기며 그것이 훅 여섯의
 * `useEffect`로 흩어졌던 것을 다시 한 자리에 모은다(#74). 화면은 세션을 세우고
 * {@linkcode ReaderSession}의 `runtime`을 마운트하기만 한다 — 리스너를 걸고 떼는 시점을
 * React의 렌더가 아니라 atom의 수명이 정한다.
 *
 * 규칙 둘이 여기서 구조로 선다.
 *
 * - **다시 걸지 않는다.** 리스너와 타이머는 Model 전체가 아니라 Model에서 뽑은 작은 값에
 *   기댄다. 레지스트리는 다시 셈한 값이 같으면 아래로 무효화를 퍼뜨리지 않으므로, 포인터가
 *   움직일 때마다 Model이 바뀌어도 제스처 리스너는 제스처가 시작하고 끝날 때만 다시
 *   걸린다. `wheel`을 `passive: false`로 다시 거는 틈에 굴림 하나가 브라우저의 것이 되는
 *   일도 그래서 없다.
 * - **지금 값은 그때 읽는다.** 리스너는 Model을 구독하지 않고, 이벤트가 온 순간
 *   `get.once`로 읽는다. 렌더마다 ref에 지금 값을 옮겨 적을 일이 없다.
 */

import { Array, Cause, Duration, Effect, Option } from 'effect'
import { Atom, AsyncResult } from 'effect/unstable/reactivity'

import type { PageAtoms, SpreadPanel } from '../../atoms/pages.ts'
import { Reading } from '../../domain/index.ts'
import { describe } from '../../errors.ts'
import type { AppError, ErrorWords } from '../../errors.ts'
import { dispatch, makeReaderAtom } from '../../reader/atom.ts'
import type { Command } from '../../reader/command.ts'
import type { Point } from '../../reader/gesture.ts'
import type { Half } from '../../reader/half.ts'
import { Message, OutMessage } from '../../reader/message.ts'
import { spreadPages } from '../../reader/model.ts'
import type { Model, PageEntry } from '../../reader/model.ts'
import { NO_ROOM } from '../../reader/scroll.ts'
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
import type { SlideshowWait } from '../../reader/subscription.ts'
import { localeAtom } from '../i18n/atoms.ts'
import { catalogFor } from '../i18n/messages.ts'
import { readerLayout } from './layout.ts'
import type { ReaderLayout } from './layout.ts'
import type { ReaderPersistence } from './persistence.ts'

/**
 * 화면에 걸린 스프레드와, 그것을 그릴 때 쓴 값들.
 *
 * 넘긴 순간 Model은 이미 다음 페이지의 `entry`·`half`·배율·이동을 쥐고 있어서, 그것으로
 * 남아 있는 페이지를 그리면 끝에 붙거나 반쪽이 바뀌거나 확대가 풀려 한 번 튄다. 그래서
 * 그릴 수 있었던 순간의 값을 모두 함께 찍어 둔다(`R-207`).
 */
export type OnScreen = Readonly<{
  page: number
  /** 그 스프레드의 페이지들. 놓지 않고 쥐어야 할 대상이기도 하다. */
  pages: ReadonlyArray<number>
  panels: ReadonlyArray<SpreadPanel>
  entry: PageEntry
  half: Half
  zoom: number
  pan: Point
}>

/** 스테이지가 그릴 스프레드와 그 상태. */
export type ShownSpread = Readonly<{
  /** 화면에 걸린 스프레드. 아직 아무것도 그릴 수 없으면 없음이다. */
  maybeShown: Option.Option<OnScreen>
  /**
   * 지금 스프레드가 그릴 수 있게 되었는지.
   *
   * 거짓인 동안 화면에 남아 있는 것은 이전 스프레드이므로, 화면에서 잰 거리는 지금
   * 페이지에 대한 사실이 아니다. 굴림에 `NO_ROOM`을 실어 보낼지가 이것으로 갈린다
   * (`R-207`).
   */
  isReady: boolean
  /** 부르다 실패했을 때의 문구. */
  maybeFailure: Option.Option<string>
}>

/** {@linkcode makeReaderSession}이 받는 것. */
export type ReaderSessionConfig = Readonly<{
  /**
   * 세워 둔 첫 Model. 저장된 자리와 설정을 읽은 뒤에 만들어야 한다 — 첫 장을 그렸다가
   * 건너뛰는 일이 없도록(`R-2B5`).
   */
  initial: Model
  pages: PageAtoms
  persistence: ReaderPersistence
  /** 책장으로 돌아간다. Escape가 마지막으로 벗기는 겹이다(`R-2A3`). */
  onExit: () => void
  /** 이웃한 책을 그 자리에서 연다(`R-216`). */
  onOpenBook: (bookId: string) => void
}>

/** 책 한 권을 읽는 동안의 리더. */
export type ReaderSession = Readonly<{
  model: Atom.Atom<Model>
  /** Message 하나를 리더에 접어 넣는다. update가 남긴 부탁까지 여기서 끝낸다. */
  send: Atom.Writable<void, Message>
  /** 책이 열렸을 때만 셈할 수 있는 배치. 여는 중이거나 실패했으면 없음이다. */
  layout: Atom.Atom<Option.Option<ReaderLayout>>
  shown: Atom.Atom<ShownSpread>
  /**
   * 리더가 서 있는 동안 걸어 둘 것 전부. 책, 리스너, 슬라이드쇼, 쥐고 있을 페이지다.
   *
   * 마운트하는 동안만 돈다. 화면이 내려가 아무도 원하지 않게 되면 레지스트리가 치우면서
   * 리스너가 떨어지고 타이머가 끊기고 페이지 URL이 놓인다.
   */
  runtime: Atom.Atom<void>
}>

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
 * 격자의 폭을 재 달라는 부탁은 여기 없다. 격자는 `ResizeObserver`로 자기 자리를 스스로
 * 재므로(`R-276`), 그 답을 Model로 돌려보낼 이유가 없다.
 */
const runCommand = (command: Command): void => {
  if (command._tag === 'ToggleFullscreen') askFullscreen(command.wantFullscreen)
}

/**
 * 실패한 까닭을 한 줄로. 까닭을 찾지 못하면 무엇을 하다 실패했는지만 말한다.
 *
 * 문구는 화면의 언어로 온다(`S-151`).
 */
const failureText = (cause: Cause.Cause<AppError>, words: ErrorWords, fallback: string): string =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => fallback,
    onSome: (error) => describe(error, words),
  })

/** 둘이 같은 페이지 목록인지. 다시 셈한 목록이 같으면 아래로 퍼지지 않게 할 때 쓴다. */
const samePages = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): boolean =>
  a.length === b.length && a.every((page, at) => page === b[at])

/** 슬라이드쇼의 기다림이 같은 것인지. 초·페이지·반쪽 가운데 하나라도 다르면 새 기다림이다. */
const sameWait = (a: Option.Option<SlideshowWait>, b: Option.Option<SlideshowWait>): boolean =>
  Option.isNone(a) || Option.isNone(b)
    ? Option.isNone(a) && Option.isNone(b)
    : a.value.seconds === b.value.seconds &&
      a.value.page === b.value.page &&
      a.value.half === b.value.half

/**
 * document에 리스너 하나를 걸고, atom이 치워질 때 뗀다.
 *
 * 리더가 듣는 것은 모두 document에 걸린다. `pointerId`와 `ctrlKey`, `deltaY`는 요소 단위
 * 핸들러에 실려 오지 않고, 드래그는 포인터가 시작한 페이지를 벗어난 뒤에도 따라가야 하기
 * 때문이다.
 */
const listen = <K extends keyof DocumentEventMap>(
  get: Atom.AtomContext,
  type: K,
  listener: (event: DocumentEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void => {
  document.addEventListener(type, listener, options)
  get.addFinalizer(() => document.removeEventListener(type, listener, options))
}

/** 책 한 권을 읽는 동안의 리더를 세운다. 화면 하나에 한 번만 부른다. */
export const makeReaderSession = ({
  initial,
  pages,
  persistence,
  onExit,
  onOpenBook,
}: ReaderSessionConfig): ReaderSession => {
  const { bookId } = initial
  const model = makeReaderAtom(initial)

  /** 애플리케이션까지 올라온 것을 처리한다. */
  const handleOut = (ctx: Atom.WriteContext<void>, out: OutMessage): void =>
    OutMessage.$match(out, {
      RequestedExit: () => onExit(),

      /**
       * 책장 순서를 아는 것은 저장소다. 이웃한 책이 없으면 — 책장의 끝이라면 — 아무 일도
       * 일어나지 않고 리더는 제자리에 머문다.
       */
      RequestedNeighbourBook: ({ bookId: from, step }) => {
        void Effect.runPromise(persistence.neighbourBookId(from, step)).then((maybeId) => {
          if (Option.isSome(maybeId)) onOpenBook(maybeId.value)
        })
      },

      /**
       * 리더가 쥔 설정은 전역 기본값과 이 책의 것을 합친 결과다. 저장할 때 다시 갈라야,
       * 책마다 기억하기가 켜진 동안 어떤 책에서 뒤집은 방향이 전역 기본값이 되어 다음
       * 책까지 따라가지 않는다.
       */
      ChangedSettings: ({ bookId: of, settings }) => {
        const { global, maybeBook } = Reading.split(ctx.get(persistence.settingsAtom), settings)

        ctx.set(persistence.settingsAtom, global)
        void Effect.runPromise(persistence.saveBookSettings(of, maybeBook))
      },

      UpdatedProgress: ({ bookId: of, page, bookmarks, marks, rotation }) => {
        void Effect.runPromise(persistence.saveProgress(of, { page, bookmarks, marks, rotation }))
      },
    })

  const send: Atom.Writable<void, Message> = Atom.writable(
    () => undefined,
    (ctx, message) => {
      const { commands, maybeOutMessage } = dispatch(ctx, model, message)

      for (const command of commands) runCommand(command)
      if (Option.isSome(maybeOutMessage)) handleOut(ctx, maybeOutMessage.value)
    },
  )

  /** 매퍼가 돌려준 Message가 있으면 보낸다. */
  const sendMaybe = (get: Atom.AtomContext, maybe: Option.Option<Message>): void => {
    if (Option.isSome(maybe)) get.set(send, maybe.value)
  }

  const layout = Atom.make((get) => readerLayout(get(model)))

  /**
   * 지금 스프레드를 부르고, 다음 것이 설 때까지 이전 것을 붙잡는다(`R-207`).
   *
   * 붙잡는 값은 이 atom이 앞서 돌려준 값이다. 지금 스프레드가 그릴 수 있는 동안에는 매번
   * 새로 찍으므로 배율과 이동이 바뀌어도 따라가고, 그릴 수 없게 된 순간부터는 마지막으로
   * 찍은 것이 남는다. 남은 스프레드는 여기서 마운트해 두어, 그리는 동안 URL이 놓이지 않는다.
   */
  const shown = Atom.make((get): ShownSpread => {
    const words = catalogFor(get(localeAtom)).error
    const now = get(model)
    const here = spreadPages(now)
    // 여는 중이면 부를 스프레드가 없다. 빈 목록으로 스프레드 atom을 부르면 0번 페이지를
    // 뜻하는 키와 구별되지 않아, 읽던 자리로 여는 책이 첫 장까지 헛되이 뽑는다.
    const current =
      here.length === 0
        ? AsyncResult.initial<ReadonlyArray<SpreadPanel>, AppError>()
        : get(pages.spread(bookId, here))

    if (AsyncResult.isSuccess(current)) {
      return {
        maybeShown: Option.some({
          page: now.page,
          pages: here,
          panels: current.value,
          entry: now.entry,
          half: now.half,
          zoom: now.zoom,
          pan: now.pan,
        }),
        isReady: true,
        maybeFailure: Option.none(),
      }
    }

    const maybeHeld = Option.flatMap(get.self<ShownSpread>(), (before) => before.maybeShown)
    if (Option.isSome(maybeHeld)) get.mount(pages.spread(bookId, maybeHeld.value.pages))

    return {
      maybeShown: maybeHeld,
      isReady: false,
      maybeFailure: AsyncResult.isFailure(current)
        ? Option.some(failureText(current.cause, words, words.showPage))
        : Option.none(),
    }
  })

  /**
   * 책이 열렸다는 것도, 열지 못했다는 것도 Message로 넣는다.
   *
   * 책 atom의 값이 바뀔 때만 알린다. 렌더가 몇 번 돌든 같은 답에 두 번 보내는 일이 없다.
   * 구독하는 동안 책 atom이 걸려 있으므로, 스프레드 사이의 틈에 책을 다시 열지도 않는다.
   */
  const opening = Atom.make((get) => {
    const words = catalogFor(get(localeAtom)).error
    get.subscribe(
      pages.book(bookId),
      (book) => {
        if (AsyncResult.isSuccess(book)) {
          get.set(
            send,
            Message.CompletedOpenBook({
              title: book.value.title,
              pageCount: book.value.pages.length,
              ratios: book.value.pageSizes.map(Option.map(({ width, height }) => width / height)),
            }),
          )
        } else if (AsyncResult.isFailure(book)) {
          get.set(
            send,
            Message.FailedOpenBook({ text: failureText(book.cause, words, words.openBook) }),
          )
        }
      },
      { immediate: true },
    )
  })

  const keyboard = Atom.make((get) => {
    listen(get, 'keydown', (event) => {
      // 설정 패널이 열려 있는 동안 Escape는 패널의 것이다. Astryx `Dialog`가 스스로
      // 닫으면서 `ClickedToggleSettings`를 보내므로, 여기서 또 한 겹 벗기면 한 번 누른
      // Escape가 두 겹을 벗긴다(`R-2A3`). 지금 Astryx는 그 Escape를 dialog에서 멈춰 세워
      // 여기까지 흘리지 않지만, 문서로 약속된 동작이 아니므로 리더가 스스로 지킨다.
      if (event.key === 'Escape' && get.once(model).isSettingsOpen) return

      sendMaybe(get, messageForKeydown(event))
    })
  })

  const pointerDown = Atom.make((get) => {
    listen(get, 'pointerdown', (event) => sendMaybe(get, messageForPointerDown(event)))
  })

  /** 제스처가 살아 있는지. 이것이 바뀔 때만 이동·놓음 리스너가 다시 걸린다. */
  const gesturing = Atom.make((get) => isGesturing(get(model)))

  /**
   * 이동과 놓음은 제스처가 살아 있는 동안에만 존재한다. 그래서 페이지를 건드리지 않는
   * 사람에게는 아무 값도 들지 않는다.
   */
  const gesture = Atom.make((get) => {
    if (!get(gesturing)) return

    listen(get, 'pointermove', (event) => get.set(send, messageForPointerMove(event)))
    listen(get, 'pointerup', (event) => get.set(send, messageForPointerUp(event)))
    listen(get, 'pointercancel', (event) => get.set(send, messageForPointerCancel(event)))
    // 창이 포커스를 잃거나 탭이 뒤로 넘어가면 놓음이 끝내 오지 않을 수 있다.
    listen(get, 'visibilitychange', () => {
      if (document.hidden) get.set(send, messageForAbandon())
    })
    const onBlur = (): void => get.set(send, messageForAbandon())
    window.addEventListener('blur', onBlur)
    get.addFinalizer(() => window.removeEventListener('blur', onBlur))
  })

  const wheel = Atom.make((get) => {
    // 페이지 위의 굴림은 브라우저에서 빼앗아야 하고, `passive`인 리스너는 그럴 수 없다.
    listen(
      get,
      'wheel',
      (event) => {
        // 다음 스프레드가 아직 서지 않았으면 재지 않는다. 그동안 화면에 남은 것은 이전
        // 페이지라, 거기서 잰 거리는 지금 페이지에 대한 사실이 아니다(`R-207`).
        const room = get.once(shown).isReady ? roomOnStage() : NO_ROOM
        sendMaybe(get, messageForWheel(event, room))
      },
      { passive: false },
    )
  })

  const fullscreen = Atom.make((get) => {
    listen(get, 'fullscreenchange', () => get.set(send, messageForFullscreenChange()))
  })

  /** 슬라이드쇼가 기다리는 것. 초·페이지·반쪽이 그대로면 아래의 타이머가 다시 걸리지 않는다. */
  const slideWait = Atom.make((get) => slideshowWait(get(model))).pipe(Atom.withEquality(sameWait))

  /**
   * 슬라이드쇼. 정해 둔 시간이 지나면 한 장 넘긴다(`R-2C1`).
   *
   * 기다림은 페이지와 반쪽에 매여 있다. 넘어가면 기다림이 바뀌어 이 atom이 다시 셈하고, 앞선
   * 기다림은 스코프와 함께 끊긴다. 그래서 사람이 손으로 넘긴 뒤에도 꽉 찬 시간을 받는다.
   */
  const slideshow = Atom.make((get) =>
    Option.match(get(slideWait), {
      onNone: () => Effect.void,
      onSome: ({ seconds }) =>
        Effect.sleep(Duration.seconds(seconds)).pipe(
          Effect.andThen(Effect.sync(() => get.set(send, Message.ElapsedSlide()))),
        ),
    }),
  )

  // 미리 읽은 적이 있는 페이지. 한 세션이 책 한 권이므로 책이 바뀔 때 비울 일이 없다.
  const warmed = new Set<number>()

  /**
   * 아직 놓지 않을 페이지. 미리 읽은 적이 있고, 지금 자리에서 `keep` 안에 드는 것들이다
   * (`R-215`).
   *
   * "미리 읽은 적이 있는지"를 따로 세는 이유는 쥐는 것과 뽑는 것이 같은 일이 되어서는 안
   * 되기 때문이다. atom은 원하는 곳이 생기는 순간 값을 만들기 시작하므로, `keep` 전부를
   * 쥐면 그것이 곧 미리 읽기 명령이 되어 책을 여는 순간 일곱 스프레드를 한꺼번에 뽑는다.
   */
  const held = Atom.make((get) =>
    Option.match(get(layout), {
      onNone: () => Array.empty<number>(),
      onSome: ({ warm, keep }) => {
        for (const page of warm) warmed.add(page)
        return Array.filter(keep, (page) => warmed.has(page))
      },
    }),
  ).pipe(Atom.withEquality(samePages))

  /** {@linkcode held}의 페이지를 쥔다. 미리 읽는 것도 붙잡는 것도 이 마운트 하나다. */
  const holds = Atom.make((get) => {
    for (const page of get(held)) get.mount(pages.pageUrl(bookId, page))
  })

  const runtime = Atom.make((get) => {
    get.mount(opening)
    get.mount(shown)
    get.mount(holds)
    get.mount(keyboard)
    get.mount(pointerDown)
    get.mount(gesture)
    get.mount(wheel)
    get.mount(fullscreen)
    get.mount(slideshow)
  })

  return { model, send, layout, shown, runtime }
}
