/** P-301~303 · 새로고침을 넘겨 남는 것들. */

import { expect, test } from '@playwright/test'

import { control, counter, importBook, openReader, openShelf, readBook } from './fixture/app.ts'

test('P-301 · 책은 새로고침을 넘겨 책장에 남는다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)

  await page.reload()

  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await expect(page.getByText('6 pages')).toBeVisible()
})

test('P-302 · 읽던 위치와 북마크가 남는다', async ({ page }) => {
  const title = await readBook(page)

  await control.next(page).click()
  await control.next(page).click()
  await expect(counter(page)).toHaveText('3 / 6')
  await control.bookmark(page).click()

  await page.reload()
  await expect(page.getByRole('img', { name: 'Page 3' })).toBeVisible()
  await expect(counter(page)).toHaveText('3 / 6')
  await expect(control.bookmark(page)).toHaveAttribute('aria-pressed', 'true')

  // 책장을 거쳐 다시 들어와도 같은 자리다.
  await control.shelf(page).click()
  await openReader(page, title)
  await expect(counter(page)).toHaveText('3 / 6')
})

test('P-303 · 설정은 남고 다음 책에도 적용된다', async ({ page }) => {
  await readBook(page)

  await expect(control.direction(page)).toHaveText('RTL')
  await control.direction(page).click()
  await control.view(page).click()
  await expect(control.direction(page)).toHaveText('LTR')
  await expect(control.view(page)).toHaveText('Two')

  await page.reload()
  await expect(control.direction(page)).toHaveText('LTR')
  await expect(control.view(page)).toHaveText('Two')
})
