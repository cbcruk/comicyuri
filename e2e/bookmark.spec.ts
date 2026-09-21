/** R-284~285 · 북마크 목록과 그 사이의 이동. */

import { expect, test } from '@playwright/test'

import { counter, readBook, readMenuItem, use } from './fixture/app.ts'

test('R-284 · 그리드를 북마크만으로 좁힌다', async ({ page }) => {
  await readBook(page)

  await use(page, 'bookmark')
  await use(page, 'next')
  await use(page, 'next')
  await expect(counter(page)).toHaveText('3 / 6')
  await use(page, 'bookmark')

  await use(page, 'everyPage')
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

  await use(page, 'bookmark')
  await use(page, 'last')
  await expect(counter(page)).toHaveText('6 / 6')
  await use(page, 'bookmark')

  await use(page, 'first')
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

  await use(page, 'bookmark')
  await use(page, 'next')
  await use(page, 'next')
  await expect(counter(page)).toHaveText('3 / 6')
  await use(page, 'bookmark')

  await use(page, 'everyPage')
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
  await use(page, 'everyPage')
  await page.getByRole('button', { name: 'Show bookmarks only' }).click()
  await expect(bookmarks.getByRole('button', { name: 'Go to page 3' })).toBeVisible()
  await expect(bookmarks.getByRole('button', { name: 'Go to page 1' })).toHaveCount(0)
})

test('R-2A2 · 한글 입력 상태에서도 글자 단축키가 먹는다', async ({ page }) => {
  await readBook(page)

  // 한글 입력 상태에서 `b` 자리를 누르면 브라우저는 `key`를 `ㅠ`로 보낸다. 실제 입력기는 켤 수
  // 없으므로 그 이벤트를 그대로 흉내 낸다.
  await page.evaluate(() => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ㅠ', code: 'KeyB', bubbles: true, cancelable: true }),
    )
  })

  await readMenuItem(page, 'bookmark', async (item) => {
    await expect(item).toHaveText(/Remove bookmark from this page/)
  })
})
