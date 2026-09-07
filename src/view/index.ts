import { Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import { Message } from '../message.ts'
import { Model } from '../model.ts'
import { Reader } from '../page/index.ts'
import { AppRoute, shelfRouter } from '../route.ts'
import { shelfView } from './shelf.ts'

const noticePageView = (heading: string, detail: string, h: HtmlBuilder<Message>): Html =>
  h.main(
    [h.Class('flex h-full flex-col items-center justify-center gap-3 p-6')],
    [
      h.h1([h.Class('text-lg font-medium')], [heading]),
      h.p([h.Class('text-sm text-muted')], [detail]),
      h.a(
        [
          h.Class(
            'text-sm text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          ),
          h.Href(shelfRouter()),
        ],
        ['Back to the shelf'],
      ),
    ],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document =>
  AppRoute.match(model.route, {
    Shelf: () => ({ title: 'comicyuri', body: shelfView(model, h) }),
    Reader: ({ id }) => ({
      title: `comicyuri — ${id}`,
      body: Option.match(model.maybeReader, {
        onNone: () => noticePageView('Opening…', id, h),
        onSome: (reader) =>
          h.submodel({
            slotId: 'reader',
            model: reader,
            view: Reader.view,
            toParentMessage: (message) => Message.GotReaderMessage({ message }),
          }),
      }),
    }),
    NotFound: ({ path }) => ({
      title: 'comicyuri — not found',
      body: noticePageView('Nothing here', path, h),
    }),
  })
