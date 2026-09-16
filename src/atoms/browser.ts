/**
 * 페이지 로딩 atom이 브라우저에 닿는 길. IndexedDB와 `URL`, `Image.decode`다.
 *
 * 앱 전체가 이 한 벌을 나눠 쓴다. 두 벌을 만들면 family도 둘이라 같은 페이지가 두 atom이
 * 되고, 압축도 URL도 두 번씩 생긴다.
 */

import { Array, Duration, Effect, Option } from 'effect'

import { MissingBookError } from '../errors.ts'
import type { AppError } from '../errors.ts'
import { getAllBooks } from '../io/db.ts'
import { bookFromStored } from '../io/loader.ts'
import type { LoadedBook } from '../types.ts'
import { makePageAtoms } from './pages.ts'
import type { PageAtoms } from './pages.ts'

/** 끝내 디코딩되지 않는 페이지가 화면을 붙잡고 있어서는 안 된다. */
const DECODE_TIMEOUT = Duration.seconds(5)

const openBook = (bookId: string): Effect.Effect<LoadedBook, AppError> =>
  Effect.gen(function* () {
    const stored = Array.findFirst(yield* getAllBooks, ({ id }) => id === bookId)

    if (Option.isNone(stored)) {
      return yield* new MissingBookError({ id: bookId })
    }

    return yield* bookFromStored(stored.value)
  })

/**
 * 브라우저가 그 이미지를 그릴 수 있게 될 때까지 기다린다(`R-206`).
 *
 * 실패하든 오래 걸리든 그냥 넘어간다. 그때는 `<img>`가 제 속도로 그리면 되고, 여기서
 * 붙잡고 있어 봐야 화면만 멎는다.
 */
const decode = (url: string): Effect.Effect<void> =>
  Effect.tryPromise(() => {
    const image = new Image()
    image.src = url
    return image.decode()
  }).pipe(
    Effect.ignore,
    Effect.timeoutOrElse({ duration: DECODE_TIMEOUT, orElse: () => Effect.void }),
  )

/** 앱이 나눠 쓰는 페이지 로딩 atom 한 벌. */
export const pageAtoms: PageAtoms = makePageAtoms({
  openBook,
  createUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
  decode,
})
