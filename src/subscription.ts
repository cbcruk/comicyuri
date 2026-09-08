import { Option } from 'effect'
import { Subscription } from 'foldkit'

import { Message } from './message.ts'
import { Model } from './model.ts'
import { Reader } from './page/index.ts'

/** 키보드는 리더의 것이고, 리더가 화면에 있는 동안만 그렇다. */
export const subscriptions = Subscription.lift(Reader.subscriptions)<Model, Message>({
  // 안전하다: `when`이 엔트리를 막고 있고, 런타임은 그 관문을 통과한 뒤에만
  // `toChildModel`에 닿는다.
  toChildModel: (model) => Option.getOrThrow(model.maybeReader),
  toParentMessage: (message) => Message.GotReaderMessage({ message }),
  when: (model) => Option.isSome(model.maybeReader),
})
