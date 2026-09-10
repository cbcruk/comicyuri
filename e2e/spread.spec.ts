/** S-121 · R-226 · R-227 — 페이지 크기와 손으로 고친 묶기가 스프레드를 정하는지. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, readBook, stage } from './fixture/app.ts'

const TALL = { width: 1200, height: 1800 }
const WIDE = { width: 2400, height: 1800 }

/** 4페이지만 양면 삽화인 여섯 쪽짜리 책. */
const withWideFourthPage = {
  fileName: 'volume-1.cbz',
  pageCount: 6,
  size: (page: number) => (page === 3 ? WIDE : TALL),
}

const shownPages = (page: Page) => stage(page).getByRole('img')

test('R-226 · 넓은 페이지는 두 장 모드에서도 혼자 나온다', async ({ page }) => {
  await readBook(page, withWideFourthPage)
  await control.view(page).click()
  await expect(control.view(page)).toHaveText('Two')

  // 표지는 원래부터 혼자다.
  await expect(shownPages(page)).toHaveCount(1)

  await control.next(page).click()
  await expect(shownPages(page)).toHaveCount(2)

  await control.next(page).click()
  await expect(shownPages(page)).toHaveCount(1)
  await expect(shownPages(page)).toHaveAttribute('alt', 'Page 4')

  // 넓은 페이지 하나가 그 뒤의 쌍을 한 장씩 밀어내지 않는다.
  await control.next(page).click()
  await expect(shownPages(page)).toHaveCount(2)
  await expect(shownPages(page).first()).toHaveAttribute('alt', 'Page 5')
})

test('R-226 · 모든 페이지가 같은 비면 처음부터 끝까지 둘씩 묶인다', async ({ page }) => {
  await readBook(page, { fileName: 'volume-1.cbz', pageCount: 6, size: TALL })
  await control.view(page).click()

  await control.next(page).click()
  await expect(shownPages(page)).toHaveCount(2)
  await control.next(page).click()
  await expect(shownPages(page)).toHaveCount(2)
})

test('S-121 · 잰 크기는 새로고침을 넘겨 남는다', async ({ page }) => {
  await readBook(page, withWideFourthPage)
  await control.view(page).click()

  await page.reload()

  // 크기를 다시 재는 것이 아니라 책 레코드에서 읽으므로, 묶기는 그대로다.
  await control.first(page).click()
  await control.next(page).click()
  await control.next(page).click()
  await expect(shownPages(page)).toHaveCount(1)
  await expect(shownPages(page)).toHaveAttribute('alt', 'Page 4')
})

test('R-227 · 자동 묶기를 손으로 뒤집고, 그것이 새로고침을 넘긴다', async ({ page }) => {
  await readBook(page, withWideFourthPage)
  await control.view(page).click()

  await control.next(page).click()
  await expect(shownPages(page)).toHaveCount(2)

  // 자동으로 묶인 두 장을 갈라 놓는다.
  await control.binding(page).click()
  await expect(shownPages(page)).toHaveCount(1)
  await expect(shownPages(page)).toHaveAttribute('alt', 'Page 2')

  await page.reload()
  await expect(shownPages(page)).toHaveCount(1)
  await expect(shownPages(page)).toHaveAttribute('alt', 'Page 2')
})

test('R-227 · 넓다고 갈라 놓은 페이지를 손으로 다시 묶는다', async ({ page }) => {
  await readBook(page, withWideFourthPage)
  await control.view(page).click()

  await control.next(page).click()
  await control.next(page).click()
  await expect(shownPages(page)).toHaveCount(1)
  await expect(shownPages(page)).toHaveAttribute('alt', 'Page 4')

  // 손으로 건 표시가 크기로 내린 판정을 이긴다.
  await control.binding(page).click()
  await expect(shownPages(page)).toHaveCount(2)
  await expect(shownPages(page).first()).toHaveAttribute('alt', 'Page 4')
})

test('R-227 · 한 장 모드에는 뒤집을 묶기가 없다', async ({ page }) => {
  await readBook(page, withWideFourthPage)
  await expect(control.binding(page)).toHaveCount(0)
})
