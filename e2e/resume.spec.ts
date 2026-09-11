/** R-2B5 · 읽던 자리가 있는 책을 다시 열 때 무엇을 할지. */

import { expect, test } from '@playwright/test'

import { control, counter, openReader, readBook } from './fixture/app.ts'

/** 3쪽까지 읽고 책장으로 나온 다음, 설정 패널에서 이어 읽기 방식을 고른다. */
const readThenChoose = async (
  page: import('@playwright/test').Page,
  choice: string,
): Promise<string> => {
  const title = await readBook(page)

  await control.next(page).click()
  await control.next(page).click()
  await expect(counter(page)).toHaveText('3 / 6')

  await control.settings(page).click()
  await page.getByRole('button', { name: choice, exact: true }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await control.shelf(page).click()

  return title
}

test('R-2B5 · 기본값은 조용히 읽던 자리로 간다', async ({ page }) => {
  const title = await readBook(page)

  await control.next(page).click()
  await expect(counter(page)).toHaveText('2 / 6')
  await control.shelf(page).click()

  await openReader(page, title)
  await expect(counter(page)).toHaveText('2 / 6')
  await expect(page.getByRole('button', { name: 'Go there' })).toHaveCount(0)
})

test('R-2B5 · 처음부터 보기로 하면 읽던 자리가 있어도 첫 장이다', async ({ page }) => {
  const title = await readThenChoose(page, 'Start over')

  await openReader(page, title)

  await expect(counter(page)).toHaveText('1 / 6')
  await expect(page.getByRole('button', { name: 'Go there' })).toHaveCount(0)
})

test('R-2B5 · 물어보기로 하면 첫 장에서 묻고, 답하면 그리로 간다', async ({ page }) => {
  const title = await readThenChoose(page, 'Ask')

  await openReader(page, title)

  await expect(counter(page)).toHaveText('1 / 6')
  await expect(page.getByText('You left this book on page 3')).toBeVisible()

  await page.getByRole('button', { name: 'Go there' }).click()
  await expect(counter(page)).toHaveText('3 / 6')
  // 답을 받았으므로 물음은 사라진다.
  await expect(page.getByRole('button', { name: 'Go there' })).toHaveCount(0)
})

test('R-2B5 · 물음을 거절하면 첫 장에 머물고, 읽던 자리는 그대로 남는다', async ({ page }) => {
  const title = await readThenChoose(page, 'Ask')

  await openReader(page, title)
  await page.getByRole('button', { name: 'Stay on the first page' }).click()

  await expect(counter(page)).toHaveText('1 / 6')
  await expect(page.getByRole('button', { name: 'Go there' })).toHaveCount(0)

  // 거절은 읽던 자리를 지우지 않는다. 다음에 열면 또 묻는다.
  await control.shelf(page).click()
  await openReader(page, title)
  await expect(page.getByText('You left this book on page 3')).toBeVisible()
})

test('R-2B5 · 처음부터 보기는 읽던 자리를 무시할 뿐 지우지 않는다', async ({ page }) => {
  const title = await readThenChoose(page, 'Start over')

  // 열었다 그대로 나온다. 리더는 받아 든 자리를 되받아 적지 않는다.
  await openReader(page, title)
  await expect(counter(page)).toHaveText('1 / 6')

  // 다시 이어 읽기로 바꾸면 3쪽이 그대로 남아 있다.
  await control.settings(page).click()
  await page.getByRole('button', { name: 'Go there', exact: true }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await control.shelf(page).click()

  await openReader(page, title)
  await expect(counter(page)).toHaveText('3 / 6')
})

test('R-2B5 · 고른 방식은 새로고침을 넘긴다', async ({ page }) => {
  await readThenChoose(page, 'Ask')

  await page.reload()
  await page.getByRole('link', { name: 'volume-1' }).click()

  await expect(page.getByText('You left this book on page 3')).toBeVisible()
})
