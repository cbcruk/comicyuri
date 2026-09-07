import { Array, Option } from 'effect'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'

import { Button } from '@foldkit/ui'
import clsx from 'clsx'

import type { FitMode, Settings } from '../../types.ts'
import { Message } from './message.ts'
import { Model, OpenState, SpreadState } from './model.ts'
import type { Panel } from './model.ts'
import { indexOfPage, spreadsFor } from './spread.ts'

const FIT_LABEL: Record<FitMode, string> = {
  contain: 'Fit',
  width: 'Width',
  height: 'Height',
  original: '1:1',
}

/** How a page is sized on the stage, per fit mode. */
const FIT_CLASS: Record<FitMode, string> = {
  contain: 'max-h-full max-w-full object-contain',
  width: 'w-full object-contain',
  height: 'h-full object-contain',
  original: 'max-w-none',
}

const controlClassName =
  'cursor-pointer rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

type ControlConfig = Readonly<{
  label: string
  message: Message
  attributes?: ReadonlyArray<Attribute<Message>>
}>

const controlView = (config: ControlConfig, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: config.message,
      toView: (attributes) =>
        h.button(
          [...attributes.button, h.Class(controlClassName), ...(config.attributes ?? [])],
          [config.label],
        ),
    },
    h,
  )

const counterLabel = (pages: ReadonlyArray<number>, pageCount: number): string => {
  const first = Option.getOrElse(Array.head(pages), () => 0)
  const last = Option.getOrElse(Array.last(pages), () => first)
  const shown = first === last ? `${first + 1}` : `${first + 1}–${last + 1}`
  return `${shown} / ${pageCount}`
}

const toolbarView = (settings: Settings, counter: string, h: HtmlBuilder<Message>): Html =>
  h.header(
    [h.Class('flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2')],
    [
      controlView({ label: '← Shelf', message: Message.ClickedExit() }, h),
      h.span([h.Class('mx-auto text-sm text-muted')], [counter]),
      controlView(
        {
          label: settings.direction === 'rtl' ? 'RTL' : 'LTR',
          message: Message.ClickedToggleDirection(),
          attributes: [h.AriaLabel('Toggle reading direction')],
        },
        h,
      ),
      controlView(
        {
          label: settings.view === 'spread' ? 'Two' : 'One',
          message: Message.ClickedToggleView(),
          attributes: [h.AriaLabel('Toggle one or two pages')],
        },
        h,
      ),
      controlView(
        {
          label: FIT_LABEL[settings.fit],
          message: Message.ClickedCycleFit(),
          attributes: [h.AriaLabel('Change how pages are fitted')],
        },
        h,
      ),
    ],
  )

const panelView = (panel: Panel, fit: FitMode, h: HtmlBuilder<Message>): Html =>
  h.keyed('img')(String(panel.page), [
    h.Class(FIT_CLASS[fit]),
    h.Src(panel.url),
    h.Alt(`Page ${panel.page + 1}`),
  ])

const stageView = (spread: SpreadState, settings: Settings, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class(
        clsx('flex flex-1 items-center justify-center gap-1 overflow-auto bg-black/20 p-2', {
          'flex-row-reverse': settings.direction === 'rtl',
        }),
      ),
    ],
    SpreadState.match(spread, {
      Loading: () => [h.p([h.Class('text-sm text-muted')], ['Loading…'])],
      Failed: ({ text }) => [h.p([h.Class('text-sm text-danger')], [text])],
      Shown: ({ panels }) => Array.map(panels, (panel) => panelView(panel, settings.fit, h)),
    }),
  )

/**
 * Previous and next sit either side of the stage in reading order, so the
 * control nearest a thumb turns the page that thumb expects.
 */
const turnView = (h: HtmlBuilder<Message>): Html =>
  h.footer(
    [h.Class('flex items-center justify-between gap-2 border-t border-edge px-4 py-2')],
    [
      controlView({ label: 'Previous', message: Message.ClickedPrevious() }, h),
      controlView({ label: 'First', message: Message.ClickedFirst() }, h),
      controlView({ label: 'Last', message: Message.ClickedLast() }, h),
      controlView({ label: 'Next', message: Message.ClickedNext() }, h),
    ],
  )

const openingView = (text: string, h: HtmlBuilder<Message>): Html =>
  h.main(
    [h.Class('flex h-full flex-col items-center justify-center gap-3 p-6')],
    [
      h.p([h.Class('text-sm text-muted')], [text]),
      controlView({ label: '← Shelf', message: Message.ClickedExit() }, h),
    ],
  )

export const view = defineView<Model, Message>((model, h): Html =>
  OpenState.match(model.openState, {
    Opening: () => openingView('Opening…', h),
    Failed: ({ text }) => openingView(text, h),
    Ready: ({ title, pageCount }) => {
      const spreads = spreadsFor(pageCount, model.settings)
      const index = indexOfPage(spreads, model.page)

      return h.main(
        [h.Class('flex h-full flex-col'), h.AriaLabel(title)],
        [
          toolbarView(
            model.settings,
            counterLabel(
              Option.getOrElse(Array.get(spreads, index), () => []),
              pageCount,
            ),
            h,
          ),
          stageView(model.spread, model.settings, h),
          turnView(h),
        ],
      )
    },
  }),
)
