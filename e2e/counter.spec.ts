/** R-217 · 카운터가 지금 걸린 파일 이름까지 말해 준다. */

import { expect, test } from '@playwright/test'

import { control, counter, readBook } from './fixture/app.ts'

test('R-217 · 카운터 아래에 아카이브 안의 파일 이름이 보인다', async ({ page }) => {
  await readBook(page)

  await expect(counter(page)).toHaveText('1 / 6')
  await expect(page.getByText('page-01.png', { exact: true })).toBeVisible()

  await control.next(page).click()
  await expect(page.getByText('page-02.png', { exact: true })).toBeVisible()
})

test('R-217 · 두 장이 걸리면 이름도 둘이다', async ({ page }) => {
  await readBook(page)
  await control.view(page).click()
  await expect(control.view(page)).toHaveText('Two')

  await control.next(page).click()
  await expect(counter(page)).toHaveText('2–3 / 6')
  await expect(page.getByText('page-02.png · page-03.png', { exact: true })).toBeVisible()
})
