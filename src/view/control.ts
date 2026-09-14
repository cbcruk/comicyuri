/**
 * 이 애플리케이션의 버튼 하나. 리더 툴바와 설정 패널, 책장이 같은 것을 쓴다.
 *
 * 메시지 타입을 받아 두므로 리더의 Message에도 애플리케이션의 Message에도 쓸 수
 * 있다. 그래서 같은 패널을 두 곳에서 열 수 있다.
 */

import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

import { Button } from '@foldkit/ui'
import clsx from 'clsx'

/**
 * 여백을 뺀 버튼의 겉모습. 크기가 다른 버튼은 이 위에 여백만 더한다.
 *
 * 책장 헤더의 버튼은 리더 툴바보다 한 단계 크다. 겉모습까지 따로 적으면 둘이 조용히
 * 갈라지므로, 갈리는 것은 여백 하나로 둔다.
 */
export const controlLookClassName =
  'cursor-pointer rounded-lg border border-edge bg-surface-2 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** 툴바와 설정 패널 버튼의 겉모습. */
export const controlClassName = clsx(controlLookClassName, 'px-3 py-1.5')

/** 버튼 하나가 필요한 것. 무엇이라 적히고, 누르면 무엇이 일어나는지. */
export type ControlConfig<Msg> = Readonly<{
  label: string
  message: Msg
  /** 겉모습을 덮어쓸 때만. 비워 두면 {@linkcode controlClassName}이다. */
  className?: string
  attributes?: ReadonlyArray<Attribute<Msg>>
}>

/** 버튼을 그린다. */
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
