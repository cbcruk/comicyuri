/**
 * 책장. 아직 옮기는 중이라 들여온 책을 늘어놓고 리더로 보내는 일만 한다.
 *
 * 들여오기, 지우기, 표지, 설정 패널은 Foldkit 쪽 `view/shelf.ts`에 남아 있고 차례로
 * 옮겨 온다.
 */

import { Effect } from 'effect'
import { Atom } from 'effect/unstable/reactivity'
import { AsyncResult } from 'effect/unstable/reactivity'
import { useAtomValue } from '@effect/atom-react'
import { Link } from '@tanstack/react-router'

import { getAllBooks } from '../io/db.ts'

/** 책장에 선 책들. 저장소를 한 번 읽는다. */
const shelfAtom = Atom.make(Effect.map(getAllBooks, (books) => books))

export const ShelfScreen = () => {
  const shelf = useAtomValue(shelfAtom)

  return (
    <main className="flex h-full flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold tracking-tight">
        comic<span className="text-accent">yuri</span>
      </h1>
      {AsyncResult.match(shelf, {
        onInitial: () => <p className="text-sm text-muted">Loading the shelf…</p>,
        onFailure: () => <p className="text-sm text-danger">Shelf storage is unavailable</p>,
        onSuccess: ({ value }) =>
          value.length === 0 ? (
            <p className="text-sm text-muted">No books yet</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {value.map((book) => (
                <li key={book.id}>
                  <Link
                    to="/book/$id"
                    params={{ id: book.id }}
                    className="text-sm text-ink underline-offset-4 hover:underline"
                  >
                    {book.title}
                  </Link>
                </li>
              ))}
            </ul>
          ),
      })}
    </main>
  )
}
