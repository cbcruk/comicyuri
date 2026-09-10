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

/**
 * 헤더의 "Open files"로 아카이브 한 권을 들여오고, 카드가 책장에 설 때까지 기다린다.
 *
 * @returns 책 제목. 카드와 리더를 찾을 때 쓴다.
 */
export const importBook = async (page: Page, book: Book = DEFAULT_BOOK): Promise<string> => {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open files' }).click()
  await (
    await chooser
  ).setFiles([
    {
      name: book.fileName,
      mimeType: 'application/vnd.comicbook+zip',
      buffer: cbz(book.pageCount, book.size),
    },
  ])

  const title = book.fileName.replace(/\.[^.]+$/, '')
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  return title
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
 * 툴바 버튼들. 버튼마다 `aria-label`이 붙어 있어서 접근 가능한 이름은 눈에 보이는
 * 글자가 아니라 그 라벨이다. 보이는 글자는 상태를 말하므로 따로 확인한다 — 예를
 * 들어 방향 버튼의 이름은 늘 "Toggle reading direction"이고 글자만 RTL/LTR로 바뀐다.
 */
export const control = {
  shelf: (page: Page) => page.getByRole('button', { name: '← Shelf' }),
  previous: (page: Page) => page.getByRole('button', { name: 'Previous' }),
  next: (page: Page) => page.getByRole('button', { name: 'Next' }),
  first: (page: Page) => page.getByRole('button', { name: 'First' }),
  last: (page: Page) => page.getByRole('button', { name: 'Last' }),
  bookmark: (page: Page) => page.getByRole('button', { name: /bookmark/i }),
  everyPage: (page: Page) => page.getByRole('button', { name: 'Show every page' }),
  fullscreen: (page: Page) => page.getByRole('button', { name: /fullscreen/i }),
  direction: (page: Page) => page.getByRole('button', { name: 'Toggle reading direction' }),
  view: (page: Page) => page.getByRole('button', { name: 'Toggle one or two pages' }),
  fit: (page: Page) => page.getByRole('button', { name: 'Change how pages are fitted' }),
  zoomOut: (page: Page) => page.getByRole('button', { name: 'Zoom out' }),
  zoomIn: (page: Page) => page.getByRole('button', { name: 'Zoom in' }),
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
