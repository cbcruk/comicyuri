/**
 * 리더 화면 테스트. 실제 Chromium에서 리더를 세우고 넘겨 본다.
 *
 * 여기서 재는 것은 대부분 `R-207`이다. 그 규칙은 "스프레드가 아직 오는 중"이라는 상태가
 * 있어야만 드러나는데, 이제 그것을 아는 것은 Model이 아니라 페이지 atom이라 story
 * 테스트로는 잴 수 없다. 그래서 페이지를 손으로 풀어 주는 가짜 atom 한 벌을 세우고,
 * 풀어 주기 전과 뒤의 화면을 본다 — 옛 story 테스트 여섯이 하던 일이다.
 *
 * 자리와 크기가 걸리는 규칙(굴림이 갈 수 있는 거리, 툴바를 숨기면 스테이지가 그 높이를
 * 가져가는 것)은 레이아웃이 정하므로 브라우저에서만 드러난다. 그래서 앱이 쓰는 스타일을
 * 그대로 들여온다.
 */

import { Effect, Option } from 'effect'
import { Atom } from 'effect/unstable/reactivity'
import { userEvent } from 'vite-plus/test/context'
import { render } from 'vitest-browser-react'
import { expect, test, vi } from 'vite-plus/test'

import { makePageAtoms } from '../../atoms/pages.ts'
import type { PageAtoms } from '../../atoms/pages.ts'
import { PAGE_ID, STAGE_ID } from '../../reader/constant.ts'
import { init } from '../../reader/model.ts'
import type { BookProgress, BookSettings, LoadedBook, Page, Settings } from '../../types.ts'
import { defaultSettings } from '../../types.ts'
import '../../styles.css'
import { Providers } from '../providers.tsx'
import type { ReaderPersistence, ReaderProgress } from './persistence.ts'
import { ReaderView } from './reader.tsx'

/** 페이지 한 장이 놓일 자리보다 크게 그려 둔다. 확대하면 화면 밖으로 넘친다. */
const PAGE_WIDTH = 400
const PAGE_HEIGHT = 600

/** 리더가 설 자리. 페이지가 여기에 `contain`으로 들어간다. */
const VIEWPORT = { width: '320px', height: '480px' } as const

const drawPng = (): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = PAGE_WIDTH
    canvas.height = PAGE_HEIGHT

    const context = canvas.getContext('2d')
    if (context === null) {
      reject(new Error('2d 컨텍스트를 얻지 못했다'))
      return
    }
    context.fillStyle = '#888'
    context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)

    canvas.toBlob((blob) =>
      blob === null ? reject(new Error('PNG를 뜨지 못했다')) : resolve(blob),
    )
  })

/** 페이지마다 같은 바이트를 쓴다. 그리는 데 드는 시간이 테스트마다 달라지지 않도록. */
const PAGE_BYTES = await drawPng()

/** 손으로 풀어 줄 때까지 닫혀 있는 문 하나. 페이지 하나가 이것 뒤에 선다. */
type Gate = Readonly<{ open: () => void; waited: Promise<void> }>

const makeGate = (): Gate => {
  let open: () => void = () => undefined
  const waited = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, waited }
}

/**
 * 가짜 페이지 하나. `read()`만 진짜로 하고 나머지는 쓰이지 않는다 — atom이 부르는 것이
 * 그것 하나이기 때문이다.
 */
const gatedPage = (page: number, gate: Gate, bytes: Blob): Page => ({
  name: `page-${String(page + 1).padStart(3, '0')}.png`,
  load: () => Effect.succeed(''),
  unload: () => undefined,
  read: () =>
    Effect.map(
      Effect.promise(() => gate.waited),
      () => bytes,
    ),
  measure: () => Effect.succeed(Option.none()),
})

/** 문 뒤에 선 책 한 권과, 그 문들. */
const makeGatedBook = (
  bookId: string,
  pageCount: number,
): Readonly<{
  pages: PageAtoms
  gates: ReadonlyArray<Gate>
  /** 지금 살아 있는 URL을 가진 페이지들, 번호 순서로. `R-215`가 이것을 잰다. */
  livePages: () => ReadonlyArray<number>
}> => {
  const gates = Array.from({ length: pageCount }, makeGate)

  // 페이지마다 제 바이트 덩어리를 준다. 내용은 같아도 객체가 달라야 만들어진 URL이
  // 어느 페이지의 것인지 되짚을 수 있다.
  const bytes = gates.map(() => new Blob([PAGE_BYTES], { type: 'image/png' }))
  const pageOf = new Map(bytes.map((blob, page) => [blob, page] as const))
  const live = new Map<string, number>()

  const book: LoadedBook = {
    id: bookId,
    title: bookId,
    source: 'images',
    pages: gates.map((gate, page) => gatedPage(page, gate, bytes[page] ?? PAGE_BYTES)),
    pageSizes: gates.map(() => Option.some({ width: PAGE_WIDTH, height: PAGE_HEIGHT })),
  }

  return {
    gates,
    livePages: () => [...live.values()].sort((a, b) => a - b),
    pages: makePageAtoms({
      openBook: () => Effect.succeed(book),
      createUrl: (blob) => {
        const url = URL.createObjectURL(blob)
        const page = pageOf.get(blob)
        if (page !== undefined) live.set(url, page)
        return url
      },
      revokeUrl: (url) => {
        live.delete(url)
        URL.revokeObjectURL(url)
      },
      decode: () => Effect.void,
    }),
  }
}

/** 아무것도 저장하지 않는 저장소. 무엇이 올라왔는지만 적어 둔다. */
const makePersistence = (
  saved: Array<ReaderProgress>,
  settings: Settings,
  maybeNeighbour: Option.Option<string>,
): ReaderPersistence => ({
  settingsAtom: Atom.make(settings),
  bookSettingsFor: Atom.family(() => Atom.make(Option.none<BookSettings>())),
  progressFor: Atom.family(() => Atom.make(Option.none<BookProgress>())),
  saveProgress: (_bookId, progress) => Effect.sync(() => void saved.push(progress)),
  saveBookSettings: () => Effect.void,
  neighbourBookId: () => Effect.succeed(maybeNeighbour),
})

const elementById = (id: string): HTMLElement => {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`${id}가 화면에 없다`)
  return found
}

/**
 * 화면에 선 크롬의 줄 수. 헤더와 푸터가 함께 서고 함께 빠지므로 `2` 아니면 `0`이다.
 *
 * 역할로 찾지 않는 이유는 `<main>` 안의 `<header>`·`<footer>`에 `banner`와 `contentinfo`가
 * 붙지 않기 때문이다 — 그 둘은 문서 전체의 머리와 꼬리를 가리키는 역할이다.
 */
const chromeRows = (): number => document.querySelectorAll('header, footer').length

/** 페이지 상자에 걸린 transform. 확대·이동·세운 각도가 한 줄에 들어 있다. */
const pageTransform = (): string => elementById(PAGE_ID).style.transform

const renderReader = async (
  options: Readonly<{
    pageCount?: number
    page?: number
    settings?: Settings
    maybeResumePage?: Option.Option<number>
    maybeNeighbour?: Option.Option<string>
  }> = {},
) => {
  const bookId = 'volume-1'
  const { pages, gates, livePages } = makeGatedBook(bookId, options.pageCount ?? 4)
  const saved: Array<ReaderProgress> = []
  const onExit = vi.fn()
  const onOpenBook = vi.fn()
  const settings = options.settings ?? defaultSettings

  const screen = await render(
    <Providers>
      <div style={VIEWPORT}>
        <ReaderView
          initial={init({
            bookId,
            page: options.page ?? 0,
            maybeResumePage: options.maybeResumePage ?? Option.none(),
            bookmarks: [],
            marks: [],
            rotation: 0,
            maybeBookSettings: Option.none(),
            settings,
          })}
          pages={pages}
          persistence={makePersistence(saved, settings, options.maybeNeighbour ?? Option.none())}
          onExit={onExit}
          onOpenBook={onOpenBook}
        />
      </div>
    </Providers>,
  )

  return { screen, gates, saved, onExit, onOpenBook, livePages }
}

/** 그 페이지가 화면에 걸릴 때까지 기다린다. */
const showsPage = async (
  screen: Awaited<ReturnType<typeof render>>,
  page: number,
): Promise<void> => {
  await expect.element(screen.getByAltText(`Page ${page}`)).toBeVisible()
}

/**
 * 트랙패드에서 온 굴림 하나를 스테이지 위에 떨어뜨린다.
 *
 * 가로 성분을 실어 트랙패드로 읽히게 한다(`deviceFor`). 마우스 휠은 끝에 닿으면 페이지를
 * 넘겨 버리므로, "갈 곳이 없다"와 "움직이지 않았다"를 가려 보려면 끝에서 멈추는 쪽이어야
 * 한다. 크로미움은 합성한 `WheelEvent`에도 `wheelDeltaY`를 채워 주므로, 그 값을 비우는
 * 것으로는 트랙패드가 되지 않는다.
 */
const scrollStage = (reading: Readonly<{ deltaY: number }>): void => {
  elementById(STAGE_ID).dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: 1,
      deltaY: reading.deltaY,
      deltaMode: 0,
    }),
  )
}

// 기본 설정은 오른쪽에서 왼쪽으로 읽는다. 그래서 왼쪽 화살표가 앞으로 가는 키다.
const FORWARD = '{ArrowLeft}'
const BACK = '{ArrowRight}'

test('the page on screen stays until the next one can be drawn', async () => {
  const { screen, gates } = await renderReader()

  gates[0]?.open()
  await showsPage(screen, 1)

  await userEvent.keyboard(FORWARD)

  // 2페이지는 아직 문 뒤에 있다. 그동안 화면에는 1페이지가 그대로 남는다.
  await expect.element(screen.getByAltText('Page 1')).toBeVisible()
  expect(screen.getByAltText('Page 2').query()).toBeNull()

  gates[1]?.open()
  await showsPage(screen, 2)
  expect(screen.getByAltText('Page 1').query()).toBeNull()
})

test('a zoomed page keeps its zoom while the next one is on its way', async () => {
  const { screen, gates } = await renderReader()

  gates[0]?.open()
  await showsPage(screen, 1)

  await userEvent.keyboard('+')
  await expect.poll(pageTransform).toContain('scale(1.25)')

  // 넘긴 순간 Model의 배율은 이미 1로 풀렸다. 화면에 남아 있는 것은 이전 페이지이므로
  // 그것이 그려지던 배율로 그려져야 한다.
  await userEvent.keyboard(FORWARD)
  await expect.element(screen.getByAltText('Page 1')).toBeVisible()
  expect(pageTransform()).toContain('scale(1.25)')

  gates[1]?.open()
  await showsPage(screen, 2)
  await expect.poll(pageTransform).toContain('scale(1)')
})

test('it keeps what it drew with, not what the next page will use', async () => {
  // 2페이지에서 뒤로 넘긴다. 뒤로 넘겨 온 페이지는 끝에서 시작하지만(`R-247`), 그 사실은
  // 다음 페이지의 것이다 — 화면에 남아 있는 페이지는 자기가 들어섰던 쪽 그대로여야 한다.
  const { screen, gates } = await renderReader({ page: 1 })

  gates[1]?.open()
  await showsPage(screen, 2)
  expect(elementById(PAGE_ID).className).not.toContain('flex-wrap-reverse')

  await userEvent.keyboard(BACK)
  await expect.element(screen.getByAltText('Page 2')).toBeVisible()
  expect(elementById(PAGE_ID).className).not.toContain('flex-wrap-reverse')

  gates[0]?.open()
  await showsPage(screen, 1)
  await expect.poll(() => elementById(PAGE_ID).className).toContain('flex-wrap-reverse')
})

test('a scroll before it arrives does not move the page on its way', async () => {
  const { screen, gates } = await renderReader()

  gates[0]?.open()
  await showsPage(screen, 1)

  // 확대해 두어야 화면에 남은 페이지에 갈 곳이 생긴다. 그 거리로 굴러가서는 안 된다는
  // 것이 이 테스트다.
  await userEvent.keyboard('+')
  await userEvent.keyboard('+')
  await expect.poll(pageTransform).toContain('scale(1.5625)')

  await userEvent.keyboard(FORWARD)
  await expect.element(screen.getByAltText('Page 1')).toBeVisible()

  scrollStage({ deltaY: 120 })

  gates[1]?.open()
  await showsPage(screen, 2)

  // 다음 페이지는 확대도 이동도 없이 제자리에 앉는다. 남아 있던 페이지의 거리로 굴렀다면
  // 여기에 0이 아닌 translate가 남는다.
  await expect.poll(pageTransform).toBe('translate(0px, 0px) scale(1) rotate(0deg)')
})

test('a zoomed page that is on screen does scroll', async () => {
  // 위 테스트가 빈 주장이 되지 않게 하는 대조군이다. 스프레드가 서 있는 동안에는 같은
  // 굴림이 페이지를 움직인다.
  const { screen, gates } = await renderReader()

  gates[0]?.open()
  await showsPage(screen, 1)

  await userEvent.keyboard('+')
  await userEvent.keyboard('+')
  await expect.poll(pageTransform).toContain('scale(1.5625)')

  scrollStage({ deltaY: 120 })

  await expect.poll(pageTransform).not.toContain('translate(0px, 0px)')
})

test('a stale answer does not replace the page on screen', async () => {
  const { screen, gates } = await renderReader()

  gates[0]?.open()
  await showsPage(screen, 1)

  await userEvent.keyboard(FORWARD)
  await userEvent.keyboard(FORWARD)
  await expect.element(screen.getByAltText('Page 1')).toBeVisible()

  // 지나쳐 온 2페이지가 이제야 도착한다. 리더는 이미 3페이지를 기다리는 중이다.
  gates[1]?.open()
  await expect.element(screen.getByAltText('Page 1')).toBeVisible()
  expect(screen.getByAltText('Page 2').query()).toBeNull()

  gates[2]?.open()
  await showsPage(screen, 3)
})

test('a key turns the page', async () => {
  const { screen, gates } = await renderReader()

  for (const gate of gates) gate.open()
  await showsPage(screen, 1)

  await userEvent.keyboard(FORWARD)
  await showsPage(screen, 2)

  await userEvent.keyboard(BACK)
  await showsPage(screen, 1)
})

test('turning a page reports where you are', async () => {
  const { screen, gates, saved } = await renderReader()

  for (const gate of gates) gate.open()
  await showsPage(screen, 1)

  await userEvent.keyboard(FORWARD)
  await showsPage(screen, 2)

  await expect.poll(() => saved.at(-1)?.page).toBe(1)
})

test('escape closes one layer at a time', async () => {
  const { screen, gates, onExit } = await renderReader()

  for (const gate of gates) gate.open()
  await showsPage(screen, 1)

  await userEvent.keyboard('t')
  await expect.element(screen.getByRole('dialog', { name: 'Every page' })).toBeVisible()

  await userEvent.keyboard(',')
  await expect.element(screen.getByRole('dialog', { name: 'Reading settings' })).toBeVisible()

  // 설정 패널은 스스로 닫히고, 리더의 키 처리도 한 겹 벗긴다. 한 번 누른 Escape가 두
  // 겹을 벗겨서는 안 된다 — 격자는 열린 채로 남아야 한다.
  await userEvent.keyboard('{Escape}')
  await expect
    .element(screen.getByRole('dialog', { name: 'Reading settings' }))
    .not.toBeInTheDocument()
  await expect.element(screen.getByRole('dialog', { name: 'Every page' })).toBeVisible()
  expect(onExit).not.toHaveBeenCalled()

  await userEvent.keyboard('{Escape}')
  await expect.element(screen.getByRole('dialog', { name: 'Every page' })).not.toBeInTheDocument()
  expect(onExit).not.toHaveBeenCalled()

  await userEvent.keyboard('{Escape}')
  await expect.poll(() => onExit.mock.calls.length).toBe(1)
})

test('the toolbar hides and the stage takes the height', async () => {
  const { screen, gates } = await renderReader()

  gates[0]?.open()
  await showsPage(screen, 1)

  const withChrome = elementById(STAGE_ID).clientHeight
  expect(chromeRows()).toBe(2)

  await userEvent.keyboard('h')
  await expect.poll(chromeRows).toBe(0)
  expect(elementById(STAGE_ID).clientHeight).toBeGreaterThan(withChrome)

  await userEvent.keyboard('h')
  await expect.poll(chromeRows).toBe(2)
  expect(elementById(STAGE_ID).clientHeight).toBe(withChrome)
})

test('rotating stands the page in a box that swapped its sides', async () => {
  const { screen, gates } = await renderReader()

  gates[0]?.open()
  await showsPage(screen, 1)
  expect(elementById(PAGE_ID).className).toContain('h-full w-full')

  await userEvent.keyboard('r')
  await expect.poll(pageTransform).toContain('rotate(90deg)')
  expect(elementById(PAGE_ID).className).toContain('h-[100cqw] w-[100cqh]')
})

test('the offer names the page and takes you there', async () => {
  const { screen, gates } = await renderReader({ maybeResumePage: Option.some(2) })

  for (const gate of gates) gate.open()
  await showsPage(screen, 1)
  await expect.element(screen.getByText('You left this book on page 3')).toBeVisible()

  await screen.getByRole('button', { name: 'Go there' }).click()
  await showsPage(screen, 3)
  expect(screen.getByText('You left this book on page 3').query()).toBeNull()
})

test('turning past the last page opens the book after this one', async () => {
  const { screen, gates, onOpenBook } = await renderReader({
    pageCount: 2,
    page: 1,
    maybeNeighbour: Option.some('volume-2'),
  })

  for (const gate of gates) gate.open()
  await showsPage(screen, 2)

  await userEvent.keyboard(FORWARD)
  await expect.poll(() => onOpenBook.mock.calls).toStrictEqual([['volume-2']])
})

test('walking the menubar with an arrow key does not turn the page', async () => {
  // 메뉴바는 키를 스스로 처리한다. 리더의 키 구독은 document에 걸려 있으므로, 양보하지
  // 않으면 옆 메뉴로 걸어가는 것만으로 읽던 자리가 움직인다(`R-265`).
  const { screen, gates } = await renderReader({ pageCount: 6, page: 2 })

  for (const gate of gates) gate.open()
  await showsPage(screen, 3)
  await expect.element(screen.getByText('3 / 6')).toBeVisible()

  const book = screen.getByRole('menuitem', { name: 'Book' }).element()
  if (book instanceof HTMLElement) book.focus()

  // 오른쪽에서 왼쪽으로 읽는 중이라 리더에게 오른쪽 화살표는 "뒤로"다. 메뉴바 위에서는
  // 옆 메뉴로 옮기는 키일 뿐이어야 한다.
  await userEvent.keyboard('{ArrowRight}')
  await expect
    .poll(() => document.activeElement)
    .toBe(screen.getByRole('menuitem', { name: 'View' }).element())

  await expect.element(screen.getByText('3 / 6')).toBeVisible()
  await showsPage(screen, 3)
  expect(screen.getByAltText('Page 2').query()).toBeNull()
})

test('pages within three spreads keep their URLs, and the ones beyond let them go', async () => {
  const { screen, gates, livePages } = await renderReader({ pageCount: 10 })
  for (const gate of gates) gate.open()
  await showsPage(screen, 1)

  // 연 자리에서는 지금 장과 미리 읽은 다음 장뿐이다. 뒤로는 갈 곳이 없다.
  await expect.poll(livePages).toEqual([0, 1])

  for (let turn = 0; turn < 3; turn += 1) await userEvent.keyboard(FORWARD)
  await showsPage(screen, 4)

  // 지나온 셋이 그대로 살아 있다. 두 장 앞으로 갔다 돌아와도 다시 뽑지 않는다.
  await expect.poll(livePages).toEqual([0, 1, 2, 3, 4])

  for (let turn = 0; turn < 2; turn += 1) await userEvent.keyboard(FORWARD)
  await showsPage(screen, 6)

  // 세 스프레드 밖으로 밀려난 둘은 놓는다. 긴 책이 메모리를 채우지 않는 이유다.
  await expect.poll(livePages).toEqual([2, 3, 4, 5, 6])
})
