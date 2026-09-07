import { Option } from 'effect'
import { Subscription } from 'foldkit'

import { Message } from './message.ts'
import { Model } from './model.ts'
import { Reader } from './page/index.ts'

/** The reader owns the keyboard, and only while it is on screen. */
export const subscriptions = Subscription.lift(Reader.subscriptions)<Model, Message>({
  // Safe: `when` gates the entry, and the runtime only reaches `toChildModel`
  // once the gate has passed.
  toChildModel: (model) => Option.getOrThrow(model.maybeReader),
  toParentMessage: (message) => Message.GotReaderMessage({ message }),
  when: (model) => Option.isSome(model.maybeReader),
})
