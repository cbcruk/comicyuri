import { Array, Option } from 'effect'
import { AsyncData } from 'foldkit'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

import { Button, FileDrop } from '@foldkit/ui'
import clsx from 'clsx'

import { Book } from '../domain/index.ts'
import { Message } from '../message.ts'
import { Model, Notice, Shelf } from '../model.ts'
import { readerRouter } from '../route.ts'
import type { Theme } from '../types.ts'

const buttonClassName =
  'cursor-pointer rounded-lg border border-edge bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const primaryButtonClassName =
  'border-transparent bg-accent text-accent-ink hover:bg-accent/90 hover:text-accent-ink'

type ButtonConfig = Readonly<{
  label: string
  message: Message
  className: string
  attributes?: ReadonlyArray<Attribute<Message>>
}>

const buttonView = (config: ButtonConfig, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: config.message,
      toView: (attributes) =>
        h.button(
          [...attributes.button, h.Class(config.className), ...(config.attributes ?? [])],
          [config.label],
        ),
    },
    h,
  )

/** The toggle says where it will take you, not where you already are. */
const themeToggleLabel = (theme: Theme): string =>
  theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

const headerView = (theme: Theme, h: HtmlBuilder<Message>): Html =>
  h.header(
    [h.Class('flex flex-wrap items-center gap-3 border-b border-edge px-6 py-4')],
    [
      h.h1(
        [h.Class('mr-auto text-xl font-semibold tracking-tight')],
        ['comic', h.span([h.Class('text-accent')], ['yuri'])],
      ),
      buttonView(
        {
          label: 'Open files',
          message: Message.ClickedOpenFiles(),
          className: clsx(buttonClassName, primaryButtonClassName),
        },
        h,
      ),
      buttonView(
        {
          label: 'Open folder',
          message: Message.ClickedOpenFolder(),
          className: buttonClassName,
        },
        h,
      ),
      buttonView(
        {
          label: '◐',
          message: Message.ClickedToggleTheme(),
          className: buttonClassName,
          attributes: [h.Title(themeToggleLabel(theme)), h.AriaLabel(themeToggleLabel(theme))],
        },
        h,
      ),
    ],
  )

/**
 * Rendered on every route so the live region exists before it has anything to
 * say; a region created together with its text is not announced.
 */
const noticeView = (notice: Notice, h: HtmlBuilder<Message>): Html =>
  h.p(
    [
      h.Class(
        clsx('px-6 pt-4 text-sm', {
          'text-muted': notice._tag !== 'Failed',
          'text-danger': notice._tag === 'Failed',
        }),
      ),
      h.Role('status'),
      h.AriaLive('polite'),
    ],
    Notice.match(notice, {
      Idle: () => [],
      Busy: ({ text }) => [text],
      Failed: ({ text }) => [`Couldn't do that — ${text}`],
    }),
  )

const coverView = (book: Book.BookSummary, h: HtmlBuilder<Message>): Html =>
  Option.match(book.maybeCoverUrl, {
    onNone: () =>
      h.div(
        [
          h.Class('flex aspect-2/3 items-center justify-center rounded-lg bg-surface-2 text-3xl'),
          h.AriaHidden(true),
        ],
        ['📖'],
      ),
    onSome: (url) =>
      h.img([
        h.Class('aspect-2/3 w-full rounded-lg bg-surface-2 object-cover'),
        h.Src(url),
        h.Alt(''),
        h.Loading('lazy'),
      ]),
  })

/**
 * The title lives inside the link so the link has an accessible name; the
 * delete control is a sibling so it is not part of it.
 */
const cardView = (book: Book.BookSummary, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')(
    book.id,
    [h.Class('group relative')],
    [
      h.a(
        [
          h.Class(
            'flex flex-col gap-2 rounded-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          ),
          h.Href(readerRouter({ id: book.id })),
          h.AriaLabel(book.title),
        ],
        [
          coverView(book, h),
          h.span([h.Class('truncate text-sm font-medium'), h.Title(book.title)], [book.title]),
          h.span([h.Class('text-xs text-muted')], [Book.pageCountLabel(book)]),
        ],
      ),
      buttonView(
        {
          label: '🗑',
          message: Message.ClickedDeleteBook({ id: book.id }),
          className:
            'absolute top-2 right-2 cursor-pointer rounded-md bg-bg/80 px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent',
          attributes: [h.AriaLabel(`Remove ${book.title} from shelf`)],
        },
        h,
      ),
    ],
  )

const emptyView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('m-auto max-w-md text-center')],
    [
      h.p([h.Class('text-lg font-medium')], ['Your shelf is empty']),
      h.p(
        [h.Class('mt-2 text-sm text-muted')],
        [
          'Open ',
          h.strong([h.Class('text-ink')], ['.cbz / .zip']),
          ' archives, image files, or a folder — or drop them here.',
        ],
      ),
      h.p(
        [h.Class('mt-4 text-xs text-muted')],
        ['Files stay in your browser, and the shelf survives a reload.'],
      ),
    ],
  )

const gridView = (books: ReadonlyArray<Book.BookSummary>, h: HtmlBuilder<Message>): Html =>
  Array.match(books, {
    onEmpty: () => emptyView(h),
    onNonEmpty: (books) =>
      h.ul(
        [h.Class('grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] content-start gap-5')],
        Array.map(books, (book) => cardView(book, h)),
      ),
  })

const placeholderView = (text: string, h: HtmlBuilder<Message>): Html =>
  h.p([h.Class('m-auto text-sm text-muted')], [text])

const shelfContentView = (shelf: Shelf, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(shelf, {
    onIdle: () => placeholderView('Opening your shelf…', h),
    onLoading: () => placeholderView('Opening your shelf…', h),
    onRefreshing: (books) => gridView(books, h),
    onSuccess: (books) => gridView(books, h),
    onFailure: (error) => placeholderView(`Couldn't open your shelf — ${error}`, h),
    onStale: ({ data }) => gridView(data, h),
  })

export const shelfView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex h-full flex-col')],
    [
      headerView(model.settings.theme, h),
      noticeView(model.notice, h),
      h.submodel({
        slotId: model.fileDrop.id,
        model: model.fileDrop,
        view: FileDrop.view,
        viewInputs: {
          // NOTE: the component's hidden file input is deliberately not
          // rendered, and `accept`/`multiple` are omitted with it, because they
          // only shape that input. Dropping is entirely on the root element;
          // the input exists for the `label for` click-to-browse pattern, which
          // this shelf does not use — the zone is the whole page, so a label
          // would open the picker on every click of a book. Browsing is on the
          // header buttons, which reach it through `File.selectMultiple`.
          toView: (attributes) =>
            h.main(
              [
                ...attributes.root,
                h.AriaLabel('Shelf'),
                h.Class(
                  'm-4 flex flex-1 flex-col overflow-y-auto rounded-xl border-2 border-dashed border-transparent p-4 transition-colors data-drag-over:border-accent data-drag-over:bg-accent/5',
                ),
              ],
              [shelfContentView(model.shelf, h)],
            ),
        },
        toParentMessage: (message) => Message.GotFileDropMessage({ message }),
      }),
    ],
  )
