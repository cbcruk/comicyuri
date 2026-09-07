import { Effect, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { Message } from './message.ts'
import type { Model } from './model.ts'

/**
 * The reader owns the keyboard while it is open. The parent gates this entry
 * on the route, so the shelf never sees these keys.
 */
export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  keyboard: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Stream.fromEventListener<KeyboardEvent>(document, 'keydown').pipe(
          Stream.mapEffect((event) =>
            Effect.sync(() => event.preventDefault()).pipe(
              Effect.as(Message.PressedKey({ key: event.key })),
            ),
          ),
        ),
    },
  ),
}))
