/**
 * 이 애플리케이션의 버튼 하나. 툴바와 설정 패널, 책장 헤더가 같은 것을 쓴다.
 *
 * 메시지 타입을 받아 두므로 리더의 Message에도 애플리케이션의 Message에도 쓸 수
 * 있다. 그래서 같은 패널을 두 곳에서 열 수 있다.
 */

import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

import { Button } from '@foldkit/ui'

/** 버튼의 겉모습. 이 문자열이 곧 이 앱의 버튼이 생긴 모양이다. */
export const controlClassName =
  'cursor-pointer rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** 버튼 하나가 필요한 것. 무엇이라 적히고, 누르면 무엇이 일어나는지. */
export type ControlConfig<Msg> = Readonly<{
  label: string
  message: Msg
  /** 겉모습을 덮어쓸 때만. 비워 두면 {@linkcode controlClassName}이다. */
  className?: string
  attributes?: ReadonlyArray<Attribute<Msg>>
}>

/**
 * 버튼을 그린다.
 *
 * @example 툴바의 버튼
 * ```ts
 * import { controlView } from './view/control.ts'
 *
 * controlView({ label: 'Close', message: Message.ClickedToggleSettings() }, h)
 * ```
 */
export const controlView = <Msg>(config: ControlConfig<Msg>, h: HtmlBuilder<Msg>): Html =>
  Button.view(
    {
      onClick: config.message,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.Class(config.className ?? controlClassName),
            ...(config.attributes ?? []),
          ],
          [config.label],
        ),
    },
    h,
  )
