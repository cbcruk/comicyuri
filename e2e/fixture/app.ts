/**
 * 앱을 시험 상태로 데려다 놓는 손잡이들.
 *
 * 브라우저 컨텍스트는 테스트마다 새로 만들어지므로 IndexedDB와 localStorage는 매번
 * 비어 있다. 책이 필요한 테스트는 실제 파일 선택창을 거쳐 들여온다 — 임포트 경로를
 * 우회해 IndexedDB에 직접 심으면, 정작 앱이 저장하는 모양과 어긋나도 알 수 없다.
 */

import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { cbz } from './archive.ts'
import type { Sizing } from './archive.ts'

/** 들여올 책 한 권의 명세. */
export type Book = Readonly<{
  /** 파일 이름. 확장자를 뗀 것이 책 제목이 된다. */
  fileName: string
  /** 페이지 수. */
  pageCount: number
  /**
   * 페이지 크기. 맞춤 모드처럼 비율에 기대는 시험에 쓰고, 번호로 정하면 책
   * 중간에 넓은 페이지가 섞인 책이 된다.
   */
  size?: Sizing
}>

const DEFAULT_BOOK: Book = { fileName: 'volume-1.cbz', pageCount: 6 }

/** 빈 책장을 연다. */
export const openShelf = async (page: Page): Promise<void> => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open files' })).toBeVisible()
}

const titleOf = (book: Book): string => book.fileName.replace(/\.[^.]+$/, '')

/**
 * 헤더의 "Open files"로 아카이브 여러 권을 한 번에 들여오고, 카드가 모두 책장에 설
 * 때까지 기다린다.
 *
 * 한 번에 고르는 것이 중요하다. 한 권씩 들여오면 들여온 시각이 갈라져 책장이 나중
 * 것을 앞에 놓으므로, 책장 순서가 권 순서와 뒤집힌다.
 *
 * @returns 책 제목들, 넘겨준 순서대로.
 */
export const importBooks = async (
  page: Page,
  books: ReadonlyArray<Book>,
): Promise<ReadonlyArray<string>> => {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open files' }).click()
  await (
    await chooser
  ).setFiles(
    books.map((book) => ({
      name: book.fileName,
      mimeType: 'application/vnd.comicbook+zip',
      buffer: cbz(book.pageCount, book.size),
    })),
  )

  const titles = books.map(titleOf)
  for (const title of titles) {
    await expect(page.getByRole('link', { name: title })).toBeVisible()
  }
  return titles
}

/**
 * 아카이브 한 권을 들여오고, 카드가 책장에 설 때까지 기다린다.
 *
 * @returns 책 제목. 카드와 리더를 찾을 때 쓴다.
 */
export const importBook = async (page: Page, book: Book = DEFAULT_BOOK): Promise<string> => {
  await importBooks(page, [book])
  return titleOf(book)
}

/**
 * 책장의 카드를 눌러 리더를 열고, 페이지가 걸릴 때까지 기다린다.
 *
 * 어느 페이지인지는 묻지 않는다. 읽던 자리가 저장된 책은 1페이지로 열리지 않는다.
 */
export const openReader = async (page: Page, title: string): Promise<void> => {
  await page.getByRole('link', { name: title }).click()
  await expect(stage(page).getByRole('img')).toBeVisible()
}

/** 책 한 권을 들여와 리더까지 연다. 대부분의 리더 테스트가 여기서 시작한다. */
export const readBook = async (page: Page, book: Book = DEFAULT_BOOK): Promise<string> => {
  await openShelf(page)
  const title = await importBook(page, book)
  await openReader(page, title)
  return title
}

/** 리더의 제스처 면. 탭·스와이프·핀치는 모두 이 위에서 일어난다. */
export const stage = (page: Page) => page.locator('#reader-stage')

/** 툴바가 세는 현재 자리, `3 / 6` 같은 문자열. */
export const counter = (page: Page) => page.locator('header span').first()

/**
 * 메뉴바가 지고 있는 컨트롤과, 그것이 어느 메뉴에 사는지.
 *
 * 예전에는 툴바에 버튼 열넷이 늘어서 있었고 e2e가 그것을 `button` 역할로 곧장 찾았다.
 * 지금은 네이티브 앱처럼 메뉴바라서, 같은 이름이 `menuitem`(또는 상태를 지는
 * `menuitemcheckbox`)으로 메뉴 안에 있다. 이름은 하나도 바뀌지 않았고 사는 곳만 바뀌었다.
 */
const MENU_OF = {
  shelf: '책',
  bookmark: '책',
  everyPage: '책',
  direction: '보기',
  view: '보기',
  fit: '보기',
  rotate: '보기',
  binding: '보기',
  zoomIn: '보기',
  zoomOut: '보기',
  fullscreen: '보기',
  hideToolbar: '보기',
  nextBookmark: '이동',
  previousBookmark: '이동',
  slideshow: '재생',
  settings: '설정',
} as const

/** 메뉴 항목의 접근 가능한 이름. 상태에 따라 갈리는 것은 정규식이다. */
const ITEM_NAME: Readonly<Record<keyof typeof MENU_OF, string | RegExp>> = {
  shelf: '← Shelf',
  bookmark: /bookmark/i,
  everyPage: 'Show every page',
  direction: 'Toggle reading direction',
  view: 'Toggle one or two pages',
  fit: 'Change how pages are fitted',
  rotate: 'Turn the page a quarter clockwise',
  binding: 'Flip how this spread is paired',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fullscreen: /fullscreen/i,
  hideToolbar: 'Hide the toolbar',
  nextBookmark: 'Next bookmark',
  previousBookmark: 'Previous bookmark',
  slideshow: /slideshow/i,
  settings: 'Reading settings',
}

/**
 * 상태를 지는 항목들. 켜짐이 `aria-checked`로 드러나므로 역할이 `menuitemcheckbox`다.
 *
 * 패널을 여는 둘(`everyPage`, `settings`)은 `aria-expanded`도 함께 진다(`R-271`, `R-2B1`).
 * 나머지는 상태가 아니라 명령이라 평범한 `menuitem`이다 — 전체화면도 그렇다. 예전 툴바의
 * 버튼도 눌림을 지지 않았고, 지금 어느 상태인지는 항목의 이름이 말한다.
 */
const CHECKABLE: ReadonlySet<string> = new Set(['bookmark', 'everyPage', 'settings', 'slideshow'])

/** 메뉴에 사는 컨트롤의 이름. */
export type MenuControl = keyof typeof MENU_OF

/**
 * 그 컨트롤이 사는 메뉴를 열고, 항목을 돌려준다.
 *
 * 항목은 메뉴가 열려 있는 동안에만 선다. 상태를 읽고 나서 다시 닫으려면
 * {@linkcode readMenuItem}을 쓴다.
 */
export const openMenu = async (page: Page, control: MenuControl) => {
  const menu = page.getByRole('menuitem', { name: MENU_OF[control], exact: true })
  if ((await page.getByRole('menu').filter({ visible: true }).count()) === 0) {
    await menu.click()
  } else {
    // 이미 다른 메뉴가 열려 있으면 그 줄에서 옮겨 간다 — 네이티브 메뉴바와 같다.
    await menu.hover()
    await menu.click()
  }
  return page.getByRole(CHECKABLE.has(control) ? 'menuitemcheckbox' : 'menuitem', {
    name: ITEM_NAME[control],
  })
}

/** 메뉴를 열어 그 항목을 누른다. 예전의 툴바 버튼 한 번 누르기에 해당한다. */
export const use = async (page: Page, control: MenuControl): Promise<void> => {
  const item = await openMenu(page, control)
  await item.click()
}

/**
 * 메뉴를 열어 항목을 읽고 다시 닫는다. 메뉴가 열린 채로 남으면 그다음 클릭이 메뉴에
 * 가로막힌다.
 */
export const readMenuItem = async (
  page: Page,
  control: MenuControl,
  read: (item: ReturnType<Page['getByRole']>) => Promise<void>,
): Promise<void> => {
  const item = await openMenu(page, control)
  await read(item)
  await page.keyboard.press('Escape')
}

/**
 * 메뉴 밖에 그대로 남아 있는 컨트롤들. 푸터의 넘김 줄과 번호 입력란, 슬라이더다.
 *
 * 읽는 동안 손이 계속 가는 것이라 메뉴에 접지 않았다. `Next`는 설정 패널의 "Next book"과
 * 이름이 겹치므로 정확히 맞는 것만 고른다.
 */
export const control = {
  previous: (page: Page) => page.getByRole('button', { name: 'Previous', exact: true }),
  next: (page: Page) => page.getByRole('button', { name: 'Next', exact: true }),
  first: (page: Page) => page.getByRole('button', { name: 'First', exact: true }),
  last: (page: Page) => page.getByRole('button', { name: 'Last', exact: true }),
  goToPage: (page: Page) => page.getByRole('spinbutton', { name: 'Go to page' }),
  slider: (page: Page) => page.getByRole('slider', { name: 'Page' }),
}

/**
 * 지금 걸려 있는 배율. 줌과 이동은 스테이지 안쪽 상자의 `transform` 하나로 나타나므로,
 * 그 행렬에서 읽어 낸다.
 */
export const zoomOf = async (page: Page): Promise<number> => {
  const transform = await stage(page)
    .locator('> div')
    .evaluate((element) => getComputedStyle(element).transform)
  if (transform === 'none') return 1
  const [scale] = transform.match(/-?[\d.]+/g) ?? []
  return Number(scale ?? 1)
}

/** 화면에 걸린 페이지의 상자. 없으면 실패한다. */
export const pageBox = async (page: Page) => {
  const box = await stage(page).getByRole('img').boundingBox()
  if (box === null) throw new Error('페이지가 없다')
  return box
}
