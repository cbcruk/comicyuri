/**
 * 리더의 Model을 담는 atom 하나.
 *
 * 여러 필드가 한 번에 움직여야 하는 규칙(`R-207`, `R-214`, 가운데 탭)이 {@linkcode update}에
 * 달려 있어서, 리더의 상호작용 상태는 쪼개지 않고 이 atom 하나에 담는다. 바꾸는 길도
 * {@linkcode dispatch} 하나뿐이다.
 *
 * 페이지 로딩은 여기 없다. 그것은 `src/atoms/pages.ts`가 자기 atom으로 맡는다.
 */

import { Option } from 'effect'
import { Atom } from 'effect/unstable/reactivity'
import type { AtomRegistry } from 'effect/unstable/reactivity'

import type { Command } from './command.ts'
import type { Message, OutMessage } from './message.ts'
import type { Model } from './model.ts'
import { update } from './update.ts'

/** 리더 Model을 담는 atom. */
export type ReaderAtom = Atom.Writable<Model>

/** `config`로 세운 리더를 담은 atom 하나를 만든다. */
export const makeReaderAtom = (initial: Model): ReaderAtom => Atom.make(initial)

/** {@linkcode dispatch}가 돌려주는, Model 밖에 남은 일. */
export type Dispatched = Readonly<{
  /** 화면이 브라우저에 대고 실제로 해 주어야 하는 것. */
  commands: ReadonlyArray<Command>
  /** 애플리케이션까지 올라가야 하는 것. 없으면 없음이다. */
  maybeOutMessage: Option.Option<OutMessage>
}>

/**
 * Message 하나를 atom에 접어 넣고, update가 남긴 Command와 OutMessage를 돌려준다.
 *
 * Model을 바꾸는 일은 여기서 끝나지만 나머지는 아니다. update는 순수한 함수라
 * 무엇을 해 달라고 말만 하므로, 그것을 실제로 하는 것은 이 값을 받아 든 쪽이다.
 */
export const dispatch = (
  registry: AtomRegistry.AtomRegistry,
  atom: ReaderAtom,
  message: Message,
): Dispatched =>
  registry.modify(atom, (model) => {
    const next = update(model, message)

    return [
      {
        commands: next.commands ?? [],
        maybeOutMessage: Option.fromUndefinedOr(next.outMessage),
      },
      next.model,
    ]
  })
