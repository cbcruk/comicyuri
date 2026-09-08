import { Effect, Option, Schema } from 'effect'
import { Runtime } from 'foldkit'
import type { Update } from 'foldkit'
import type { Url } from 'foldkit/url'

import { FileDrop } from '@foldkit/ui'

import { ApplyTheme, LoadProgress, LoadShelf } from './command.ts'
import { FILE_DROP_ID } from './constant.ts'
import { Message } from './message.ts'
import { Model, Notice, Shelf } from './model.ts'
import { AppRoute, urlToAppRoute } from './route.ts'
import { loadSettings } from './storage.ts'
import { Settings } from './types.ts'

// FLAGS

/**
 * Settings decide the theme. `index.html` ships the dark default, so a reader
 * who picked the light theme sees one dark frame before `ApplyTheme` lands.
 */
export const Flags = Schema.Struct({ settings: Settings })
/** The decoded value of the {@linkcode Flags} schema. */
export type Flags = typeof Flags.Type

/** Reads what the first Model needs from storage before anything renders. */
export const flags: Effect.Effect<Flags> = Effect.map(loadSettings, (settings) =>
  Flags.make({ settings }),
)

// INIT

/**
 * Builds the first Model from the flags and the URL that was opened.
 *
 * The shelf starts loading and the theme is applied straight away; a deep link
 * into a book asks for its saved position and leaves the reader absent until
 * the answer arrives, so no book ever opens on page one and then jumps.
 */
export const init: Runtime.RoutingApplicationInit<Model, Message, Flags> = (
  flags: Flags,
  url: Url,
): Update.Return<Model, Message> => {
  const route = urlToAppRoute(url)

  return {
    model: {
      route,
      settings: flags.settings,
      shelf: Shelf.Loading(),
      notice: Notice.Idle(),
      fileDrop: FileDrop.init({ id: FILE_DROP_ID }),
      // A deep link into a book still needs its saved position first.
      maybeReader: Option.none(),
    },
    commands: [
      ApplyTheme({ theme: flags.settings.theme }),
      LoadShelf(),
      ...AppRoute.match(route, {
        Reader: ({ id }) => [LoadProgress({ bookId: id })],
        Shelf: () => [],
        NotFound: () => [],
      }),
    ],
  }
}
