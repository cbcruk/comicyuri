import { Effect, Schema } from 'effect'
import { Runtime } from 'foldkit'
import type { Update } from 'foldkit'
import type { Url } from 'foldkit/url'

import { FileDrop } from '@foldkit/ui'

import { ApplyTheme, LoadShelf } from './command.ts'
import { FILE_DROP_ID } from './constant.ts'
import { Message } from './message.ts'
import { Model, Notice, Shelf } from './model.ts'
import { urlToAppRoute } from './route.ts'
import { loadSettings } from './storage.ts'
import { Settings } from './types.ts'

// FLAGS

/**
 * Settings decide the theme. `index.html` ships the dark default, so a reader
 * who picked the light theme sees one dark frame before `ApplyTheme` lands.
 */
export const Flags = Schema.Struct({ settings: Settings })
export type Flags = typeof Flags.Type

export const flags: Effect.Effect<Flags> = Effect.map(loadSettings, (settings) =>
  Flags.make({ settings }),
)

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message, Flags> = (
  flags: Flags,
  url: Url,
): Update.Return<Model, Message> => ({
  model: {
    route: urlToAppRoute(url),
    settings: flags.settings,
    shelf: Shelf.Loading(),
    notice: Notice.Idle(),
    fileDrop: FileDrop.init({ id: FILE_DROP_ID }),
  },
  commands: [ApplyTheme({ theme: flags.settings.theme }), LoadShelf()],
})
