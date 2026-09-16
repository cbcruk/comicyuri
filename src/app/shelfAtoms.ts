/**
 * 책장의 데이터. 저장소가 쥔 책들, 표지 object URL, 들여오기와 지우기, 그리고 테마다.
 *
 * Foldkit 책장은 표지 URL의 수명을 손으로 쥐었다. `LoadShelf`가 지금 화면에 걸린 URL을
 * `have`로 받아 그대로 남은 책에는 되돌려 주고, 뒤따르는 `RevokeCoverUrls`가 밀려난
 * 것만 놓아 주었다. 여기서는 그것을 atom의 수명에 맡긴다 — `src/atoms/pages.ts`가 페이지
 * URL에 하는 것과 같다.
 *
 * - 표지 하나가 atom 하나다. 카드가 화면에 선 동안 그 atom이 URL을 쥐고, 마지막 카드가
 *   사라지면 레지스트리가 atom을 치우며 스코프가 닫혀 URL이 해제된다.
 * - 표지 atom은 책 목록을 `resultOnce`로 읽는다. 구독하지 않으므로 책장을 다시 읽어도
 *   다시 돌지 않고, 그대로 남은 책의 `src`가 바뀌지 않는다(`S-117`).
 */

import { Effect, Option } from 'effect'
import { Atom } from 'effect/unstable/reactivity'

import { ARCHIVE_ACCEPT } from '../constant.ts'
import { Book } from '../domain/index.ts'
import { describe } from '../errors.ts'
import type { AppError } from '../errors.ts'
import { deleteBook, getAllBooks, putBook } from '../io/db.ts'
import type { StoredBook } from '../io/db.ts'
import { bookFromStored, measurePages, storedBooksFromFiles } from '../io/loader.ts'
import { loadSettings, saveSettings } from '../io/storage.ts'
import { makeCover } from '../io/thumbnail.ts'
import type { Theme } from '../types.ts'

/** 카드 한 장이 그릴 것. 표지는 여기 없고 {@linkcode coverUrlAtom}이 따로 쥔다. */
export type ShelfBook = Readonly<{
  id: string
  title: string
  /** 카드가 적을 분량. `24 pages`, 한 쪽짜리는 `1 page`다(`S-103`). */
  countLabel: string
}>

const toShelfBook = (stored: StoredBook): ShelfBook => ({
  id: stored.id,
  title: stored.title,
  countLabel: Book.pageCountLabel(Book.fromRecord(stored, Option.none())),
})

/**
 * 저장소에 놓인 그대로의 책들. 표지 blob이 여기 있어서 표지 atom이 이것을 읽는다.
 *
 * 들여오기와 지우기가 이 atom을 `refresh`한다. 다시 읽는 동안에도 앞서 읽은 값이
 * `waiting`으로 남으므로 격자가 비었다가 다시 그려지지 않는다(`S-117`).
 */
const recordsAtom = Atom.make(getAllBooks)

/**
 * 책장에 설 책들. 최근에 들여온 것이 앞이며, 그 순서는 뷰가 아니라 저장 계층이
 * 정한다(`S-102`).
 *
 * 실패는 문구로 바꿔 둔다. 화면이 `Couldn't open your shelf — `에 이어 붙일 수 있는
 * 것은 `Cause`가 아니라 문장이다.
 */
export const shelfAtom = Atom.make((get) =>
  get.result(recordsAtom).pipe(
    Effect.map((records) => records.map(toShelfBook)),
    Effect.catch((error) => Effect.fail(describe(error))),
  ),
)

/**
 * 책 한 권의 표지 object URL. 표지가 없는 책은 없음이다(`S-103`).
 *
 * URL은 이 atom의 스코프에 매여 있다. 그 카드를 원하는 곳이 하나도 남지 않으면
 * 레지스트리가 atom을 치우고, 스코프가 닫히며 URL이 해제된다 — Foldkit의
 * `RevokeCoverUrls`가 하던 일이다.
 */
export const coverUrlAtom = Atom.family((bookId: string) =>
  Atom.make((get) =>
    Effect.gen(function* () {
      const records = yield* get.resultOnce(recordsAtom)
      const cover = records.find((record) => record.id === bookId)?.cover

      if (cover === undefined) return Option.none<string>()

      return Option.some(
        yield* Effect.acquireRelease(
          Effect.sync(() => URL.createObjectURL(cover)),
          (url) => Effect.sync(() => URL.revokeObjectURL(url)),
        ),
      )
    }),
  ),
)

/**
 * 책을 한 번 열어 유효한지 보고, 페이지를 세어 재고, 표지를 떠 둔다.
 *
 * `command.ts`의 같은 이름 함수를 그대로 옮긴 것이다.
 */
const importOne = (record: StoredBook): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const book = yield* bookFromStored(record)
    const first = book.pages[0]

    // 크기는 지금 재 둔다. 그려야 알 수 있는 값이 되면 스프레드 묶기가 읽는
    // 도중에 바뀌고, 그러면 위치라는 개념이 무너진다(`S-121`).
    const pageSizes = yield* measurePages(book)

    const maybeCover = first
      ? // 표지가 없는 것은 겉모습의 문제다. object URL은 어느 쪽이든 놓아 준다(`S-120`).
        yield* makeCover(yield* first.load()).pipe(
          Effect.ensuring(Effect.sync(() => first.unload())),
          Effect.option,
        )
      : Option.none<Blob>()

    yield* putBook({
      id: record.id,
      title: record.title,
      source: record.source,
      names: record.names,
      blobs: record.blobs,
      createdAt: record.createdAt,
      pageCount: book.pages.length,
      pageSizes,
      cover: Option.getOrUndefined(maybeCover),
    })
  })

/**
 * 들여온 책을 브라우저가 스스로 지우지 않도록 영구 저장을 요청한다.
 *
 * 거절되거나 API가 없어도 실패가 아니다. 지킬 것이 생긴 때가 요청할 때라서(`P-307`)
 * 들여오기가 끝난 자리에 붙는다.
 */
const requestPersistentStorage: Effect.Effect<void> = Effect.tryPromise(async () => {
  const storage: StorageManager | undefined = navigator.storage
  if (storage === undefined) return false
  return (await storage.persisted()) || (await storage.persist())
}).pipe(Effect.ignore)

/**
 * 고른 파일을 들여오고 책장을 다시 읽는다(`S-114`, `S-117`).
 *
 * 실패를 던지지 않고 문구로 돌려주는 것은 Foldkit의 Command가 `Failed…` 메시지로
 * 답하던 것과 같다. 상태 줄이 그 문구의 주인이다.
 *
 * @returns 실패 문구. 성공이면 없음이다.
 */
export const importFilesAtom = Atom.fn<ReadonlyArray<File>>()((files, get) =>
  storedBooksFromFiles(files).pipe(
    Effect.flatMap((records) => Effect.forEach(records, importOne, { discard: true })),
    Effect.tap(() => Effect.sync(() => get.refresh(recordsAtom))),
    Effect.tap(() => requestPersistentStorage),
    Effect.as(Option.none<string>()),
    Effect.catch((error) => Effect.succeed(Option.some(describe(error)))),
  ),
)

/**
 * 책 한 권을 책장에서 영영 지우고 다시 읽는다(`S-132`).
 *
 * 실패하면 다시 읽지 않는다. 지우지 못한 책은 화면에 그대로 있어야 한다(`S-133`).
 *
 * @returns 실패 문구. 성공이면 없음이다.
 */
export const deleteBookAtom = Atom.fn<string>()((id: string, get) =>
  deleteBook(id).pipe(
    Effect.tap(() => Effect.sync(() => get.refresh(recordsAtom))),
    Effect.as(Option.none<string>()),
    Effect.catch((error) => Effect.succeed(Option.some(describe(error)))),
  ),
)

/**
 * 지금 걸린 테마.
 *
 * 첫 값을 그 자리에서 읽는 것은 `localStorage`가 동기이기 때문이다. 버튼은 무엇을
 * 그리기 전에 갈 곳을 알아야 하고(`S-141`), 기다리는 동안 보여 줄 중간 상태가 없다.
 */
export const themeAtom: Atom.Writable<Theme> = Atom.make(Effect.runSync(loadSettings).theme)

/** 브라우저 UI에 알려 줄 바탕색. `styles.css`의 `--color-bg`와 같은 값이다. */
const THEME_COLOUR: Record<Theme, string> = {
  dark: '#14141a',
  light: '#f4f2f7',
}

/**
 * 고른 테마를 저장하고 문서 루트의 `data-theme`과 브라우저의 `theme-color`에 건다.
 *
 * 테마는 어떤 컴포넌트의 것도 아닌 문서 요소의 속성이다. Tailwind의 variant와
 * `color-scheme`이 둘 다 루트 요소를 보기 때문이다. `theme-color`는 문서가 아니라
 * 브라우저가 자기 UI를 칠하는 값이라 CSS 변수가 닿지 않으므로 따로 적어 준다(`S-142`).
 */
export const applyAndSaveTheme = (theme: Theme): Effect.Effect<void> =>
  Effect.gen(function* () {
    const settings = yield* loadSettings
    yield* saveSettings({ ...settings, theme })

    document.documentElement.dataset['theme'] = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOUR[theme])
  })

/**
 * 화면 밖의 `input`을 세워 선택기를 열고, 고른 것을 받아 치운다.
 *
 * 취소는 실패가 아니라 빈 목록이다. 아무것도 고르지 않은 것과 구별되지 않는다(`S-118`).
 */
const selectFiles = (
  configure: (input: HTMLInputElement) => void,
): Effect.Effect<ReadonlyArray<File>> =>
  Effect.callback<ReadonlyArray<File>>((resume, signal) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.style.display = 'none'
    configure(input)

    const cleanup = () => input.remove()

    input.addEventListener('change', () => {
      const files = input.files ? [...input.files] : []
      cleanup()
      resume(Effect.succeed(files))
    })
    input.addEventListener('cancel', () => {
      cleanup()
      resume(Effect.succeed([]))
    })
    signal.addEventListener('abort', cleanup)

    document.body.appendChild(input)
    input.click()
  })

/** 아카이브와 낱장 이미지를 여러 개 고르는 선택기를 연다(`S-112`). */
export const pickFiles: Effect.Effect<ReadonlyArray<File>> = selectFiles((input) => {
  input.multiple = true
  input.accept = ARCHIVE_ACCEPT.join(',')
})

/**
 * 폴더를 고르는 선택기를 열고, 그 안의 파일을 모두 받는다(`S-113`).
 *
 * `accept`를 걸지 않는다. 폴더 선택기에서는 거를 것이 아니라 하위 파일 전체를 받아
 * 페이지가 될 수 있는 것만 남기기 때문이다(`S-114`).
 */
export const pickFolder: Effect.Effect<ReadonlyArray<File>> = selectFiles((input) => {
  input.webkitdirectory = true
})
