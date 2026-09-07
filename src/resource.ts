import { ManagedResource } from 'foldkit'

import { Message } from './message.ts'
import { Model } from './model.ts'
import { Reader } from './page/index.ts'

/**
 * The reader's open book, gated on the reader existing. Lifting rather than
 * redeclaring keeps the resource's Messages the reader's own.
 */
export const managedResources = ManagedResource.lift(Reader.managedResources)<Model, Message>({
  toChildModel: (model) => model.maybeReader,
  toParentMessage: (message) => Message.GotReaderMessage({ message }),
})
