import { Runtime } from 'foldkit'

import { Flags, flags, init } from './main.ts'
import { Message } from './message.ts'
import { Model } from './model.ts'
import { update } from './update.ts'
import { view } from './view/index.ts'

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: (request) => Message.ClickedLink({ request }),
    onUrlChange: (url) => Message.ChangedUrl({ url }),
  },
  devTools: {
    Message,
  },
})

Runtime.run(application, { flags })
