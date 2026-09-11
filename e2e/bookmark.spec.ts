/** R-284~285 · 북마크 목록과 그 사이의 이동. */

import { expect, test } from '@playwright/test'

import { control, counter, readBook } from './fixture/app.ts'

test('R-284 · 그리드를 북마크만으로 좁힌다', async ({ page }) => {
  await readBook(page)

  await control.bookmark(page).click()
  await control.next(page).click()
  await control.next(page).click()
  await expect(counter(page)).toHaveText('3 / 6')
  await control.bookmark(page).click()

  await control.everyPage(page).click()
  const everyPage = page.getByRole('dialog', { name: 'Every page' })
  await expect(everyPage.getByRole('button', { name: 'Go to page 2' })).toBeVisible()

  await page.getByRole('button', { name: 'Show bookmarks only' }).click()
  const bookmarks = page.getByRole('dialog', { name: 'Bookmarks' })
  await expect(bookmarks.getByRole('button', { name: 'Go to page 1' })).toBeVisible()
  await expect(bookmarks.getByRole('button', { name: 'Go to page 3' })).toBeVisible()
  await expect(bookmarks.getByRole('button', { name: 'Go to page 2' })).toHaveCount(0)

  // 목록에서 고른 페이지로 가고 격자가 닫힌다.
  await bookmarks.getByRole('button', { name: 'Go to page 3' }).click()
  await expect(bookmarks).toBeHidden()
  await expect(counter(page)).toHaveText('3 / 6')
})

test('R-285 · `[`/`]`가 앞뒤 북마크로 건너뛴다', async ({ page }) => {
  await readBook(page)

  await control.bookmark(page).click()
  await control.last(page).click()
  await expect(counter(page)).toHaveText('6 / 6')
  await control.bookmark(page).click()

  await control.first(page).click()
  await expect(counter(page)).toHaveText('1 / 6')

  await page.keyboard.press(']')
  await expect(counter(page)).toHaveText('6 / 6')

  await page.keyboard.press('[')
  await expect(counter(page)).toHaveText('1 / 6')

  // 그쪽에 북마크가 더 없으면 제자리다.
  await page.keyboard.press('[')
  await expect(counter(page)).toHaveText('1 / 6')
})

test('R-286 · 목록에서 북마크를 바로 지우고, 그것이 새로고침을 넘긴다', async ({ page }) => {
  await readBook(page)

  await control.bookmark(page).click()
  await control.next(page).click()
  await control.next(page).click()
  await expect(counter(page)).toHaveText('3 / 6')
  await control.bookmark(page).click()

  await control.everyPage(page).click()
  await page.getByRole('button', { name: 'Show bookmarks only' }).click()
  const bookmarks = page.getByRole('dialog', { name: 'Bookmarks' })
  await expect(bookmarks.getByRole('button', { name: 'Go to page 1' })).toBeVisible()

  await bookmarks.getByRole('button', { name: 'Remove the bookmark on page 1' }).click()

  // 지운 것만 목록에서 빠지고, 리더는 보고 있던 페이지에 그대로 있다.
  await expect(bookmarks.getByRole('button', { name: 'Go to page 1' })).toHaveCount(0)
  await expect(bookmarks.getByRole('button', { name: 'Go to page 3' })).toBeVisible()
  await bookmarks.getByRole('button', { name: 'Close' }).click()
  await expect(counter(page)).toHaveText('3 / 6')

  await page.reload()
  await control.everyPage(page).click()
  await page.getByRole('button', { name: 'Show bookmarks only' }).click()
  await expect(bookmarks.getByRole('button', { name: 'Go to page 3' })).toBeVisible()
  await expect(bookmarks.getByRole('button', { name: 'Go to page 1' })).toHaveCount(0)
})
