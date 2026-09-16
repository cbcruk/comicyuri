/**
 * 리더. 지금은 페이지를 걸고 넘기는 데까지만 옮겼다.
 *
 * 규칙은 Foldkit 리더와 같다. 스프레드는 모든 페이지를 그릴 수 있게 된 뒤에 걸리고
 * (`R-206`), 다음 것이 설 때까지 이전 것이 화면에 남으며(`R-207`), 양옆 스프레드를 하나씩
 * 미리 읽어 둔다(`R-215`). 다만 그 일들을 update가 아니라 atom 구독이 맡는다.
 *
 * 제스처·확대·툴바·설정은 아직 Foldkit 쪽에 있다.
 */

import { Option } from 'effect'
import { AsyncResult } from 'effect/unstable/reactivity'
import { useAtomMount, useAtomValue } from '@effect/atom-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { pageAtoms } from '../atoms/browser.ts'
import type { SpreadPanel } from '../atoms/pages.ts'
import { indexOfPage, pagesAt, spreadsFor } from '../page/reader/spread.ts'
import { defaultSettings } from '../types.ts'
import type { LoadedBook } from '../types.ts'

/** 스프레드 하나를 구독만 한다. 그리지는 않고, 그 페이지 URL이 놓이지 않게 쥔다. */
const Hold = ({ bookId, pages }: Readonly<{ bookId: string; pages: ReadonlyArray<number> }>) => {
  useAtomMount(pageAtoms.spread(bookId, pages))
  return null
}

/** 마지막으로 그릴 수 있었던 스프레드. 다음 것이 설 때까지 화면에 남는다(`R-207`). */
type Shown = Readonly<{ pages: ReadonlyArray<number>; panels: ReadonlyArray<SpreadPanel> }>

const Pages = ({ bookId, book }: Readonly<{ bookId: string; book: LoadedBook }>) => {
  const spreads = useMemo(
    () =>
      spreadsFor(
        {
          pageCount: book.pages.length,
          ratios: book.pageSizes.map(Option.map(({ width, height }) => width / height)),
          marks: [],
        },
        defaultSettings,
      ),
    [book],
  )
  const [page, setPage] = useState(0)
  const index = indexOfPage(spreads, page)
  const pages = pagesAt(spreads, index)

  const current = useAtomValue(pageAtoms.spread(bookId, pages))
  const [shown, setShown] = useState<Shown | null>(null)
  useEffect(() => {
    if (AsyncResult.isSuccess(current)) setShown({ pages, panels: current.value })
    // `pages`는 렌더마다 새 배열이라 의존성에서 뺀다. `current`가 바뀌는 것이 곧 스프레드가
    // 바뀌는 것이다.
  }, [current])

  const isReady = AsyncResult.isSuccess(current)
  const panels = isReady ? current.value : (shown?.panels ?? [])
  const neighbours = [index - 1, index + 1]
    .map((at) => pagesAt(spreads, at))
    .filter((spread) => spread.length > 0)

  const goToSpread = (at: number) => {
    const target = pagesAt(spreads, Math.min(Math.max(at, 0), spreads.length - 1))
    if (target[0] !== undefined) setPage(target[0])
  }

  const first = (pages[0] ?? 0) + 1
  const last = (pages.at(-1) ?? 0) + 1

  return (
    <main className="relative flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-edge px-4 py-2">
        <Link to="/" className="text-sm text-ink underline-offset-4 hover:underline">
          ← Shelf
        </Link>
        <span className="mx-auto text-sm text-muted">
          {first === last ? `${first}` : `${first}–${last}`} / {book.pages.length}
        </span>
      </header>
      <div
        id="reader-stage"
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-black/20 p-2"
      >
        <div id="reader-page" className="flex h-full w-full items-center justify-center">
          {panels.length === 0 ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            panels.map((panel) => (
              <img
                key={panel.page}
                alt={`Page ${panel.page + 1}`}
                src={panel.url}
                draggable={false}
                className="max-h-full max-w-full object-contain"
              />
            ))
          )}
        </div>
      </div>
      {!isReady && shown !== null ? <Hold bookId={bookId} pages={shown.pages} /> : null}
      {neighbours.map((spread) => (
        <Hold key={spread.join(',')} bookId={bookId} pages={spread} />
      ))}
      <footer className="flex items-center justify-between gap-2 border-t border-edge px-4 py-2">
        <button type="button" onClick={() => goToSpread(0)}>
          First
        </button>
        <button type="button" onClick={() => goToSpread(index - 1)}>
          Previous
        </button>
        <button type="button" onClick={() => goToSpread(index + 1)}>
          Next
        </button>
        <button type="button" onClick={() => goToSpread(spreads.length - 1)}>
          Last
        </button>
      </footer>
    </main>
  )
}

/** 리더가 떠 있는 동안 책 atom을 쥔다. 스프레드 사이의 틈에 책을 다시 열지 않는다. */
export const ReaderScreen = ({ bookId }: Readonly<{ bookId: string }>) => {
  const bookAtom = pageAtoms.book(bookId)
  useAtomMount(bookAtom)

  return AsyncResult.match(useAtomValue(bookAtom), {
    onInitial: () => <p className="p-6 text-sm text-muted">Opening…</p>,
    onFailure: () => <p className="p-6 text-sm text-danger">Could not open the book</p>,
    onSuccess: ({ value }) => <Pages bookId={bookId} book={value} />,
  })
}
