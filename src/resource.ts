import { ManagedResource } from 'foldkit'

import { Message } from './message.ts'
import { Model } from './model.ts'
import { Reader } from './page/index.ts'

/**
 * 리더가 연 책. 리더가 있을 때만 열린다. 다시 선언하지 않고 lift 하므로 이
 * 리소스의 Message는 리더의 것으로 남는다.
 */
export const managedResources = ManagedResource.lift(Reader.managedResources)<Model, Message>({
  toChildModel: (model) => model.maybeReader,
  toParentMessage: (message) => Message.GotReaderMessage({ message }),
})
