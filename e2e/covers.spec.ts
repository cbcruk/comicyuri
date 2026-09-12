/** S-117 · 한 권을 들여와도 이미 선 책의 표지는 다시 그려지지 않는다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { importBook, openShelf } from './fixture/app.ts'

/** 카드마다 지금 걸린 표지 URL. 제목으로 찾는다. */
const coverOf = (page: Page, title: string): Promise<string | null> =>
  page.getByRole('link', { name: title }).locator('img').getAttribute('src')

test('S-117 · 한 권을 더 들여와도 이미 선 책의 표지 URL이 그대로다', async ({ page }) => {
  await openShelf(page)
  const first = await importBook(page, { fileName: 'volume-1.cbz', pageCount: 4 })

  const before = await coverOf(page, first)
  expect(before).toMatch(/^blob:/)

  const second = await importBook(page, { fileName: 'volume-2.cbz', pageCount: 6 })
  await expect(page.getByRole('link', { name: second })).toBeVisible()

  // 같은 URL이면 `img`가 다시 받아 그리지 않는다.
  expect(await coverOf(page, first)).toBe(before)
})

test('S-117 · 남은 표지는 한 권을 지운 뒤에도 그대로다', async ({ page }) => {
  await openShelf(page)
  const kept = await importBook(page, { fileName: 'volume-1.cbz', pageCount: 4 })
  const gone = await importBook(page, { fileName: 'volume-2.cbz', pageCount: 6 })

  const before = await coverOf(page, kept)

  await page.getByRole('button', { name: `Remove ${gone} from shelf…` }).click()
  await page.getByRole('button', { name: `Remove ${gone} from shelf`, exact: true }).click()
  await expect(page.getByRole('link', { name: gone })).toHaveCount(0)

  expect(await coverOf(page, kept)).toBe(before)
})
