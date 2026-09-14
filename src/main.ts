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
import { loadSettings } from './io/storage.ts'
import { Settings } from './types.ts'

// FLAGS

/**
 * 부팅할 때 `localStorage`에서 읽어 넘기는 값.
 *
 * 테마는 설정이 정한다. 첫 프레임의 테마는 `index.html`의 인라인 스크립트가 먼저
 * 세우고(`S-144`), `ApplyTheme`은 같은 값을 다시 건다.
 */
export const Flags = Schema.Struct({ settings: Settings })
/** {@linkcode Flags} 스키마의 디코딩된 값. */
export type Flags = typeof Flags.Type

/** 무엇을 그리기 전에, 첫 Model이 필요로 하는 것을 저장소에서 읽는다. */
export const flags: Effect.Effect<Flags> = Effect.map(loadSettings, (settings) =>
  Flags.make({ settings }),
)

// INIT

/**
 * 플래그와 열린 URL로 첫 Model을 만든다.
 *
 * 책장은 곧바로 읽기 시작하고 테마도 바로 적용한다. 책으로 바로 들어온
 * 링크라면 저장된 위치를 먼저 묻고 답이 올 때까지 리더를 비워 두므로, 어떤
 * 책도 1페이지를 보였다가 건너뛰지 않는다.
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
      nextNoticeToken: 0,
      fileDrop: FileDrop.init({ id: FILE_DROP_ID }),
      maybePendingDelete: Option.none(),
      isSettingsOpen: false,
      // 책으로 바로 들어온 링크도 저장된 위치가 먼저다.
      maybeReader: Option.none(),
    },
    commands: [
      ApplyTheme({ theme: flags.settings.theme }),
      LoadShelf({ have: [] }),
      ...AppRoute.match(route, {
        Reader: ({ id }) => [LoadProgress({ bookId: id })],
        Shelf: () => [],
        NotFound: () => [],
      }),
    ],
  }
}
