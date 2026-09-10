/** R-216 · 한 권을 다 읽고 계속 넘기면 다음 권이 그 자리에서 열리는지. */

import { expect, test } from '@playwright/test'

import { control, counter, importBooks, openReader, openShelf } from './fixture/app.ts'

const VOLUMES = [
  { fileName: 'volume-1.cbz', pageCount: 4 },
  { fileName: 'volume-2.cbz', pageCount: 6 },
]

test('R-216 · 마지막 장에서 넘기면 다음 권이 열린다', async ({ page }) => {
  await openShelf(page)
  const [first] = await importBooks(page, VOLUMES)
  await openReader(page, first!)

  await control.last(page).click()
  await expect(counter(page)).toHaveText('4 / 4')

  await control.next(page).click()

  await expect(page).toHaveURL(/\/book\/volume-2/)
  await expect(counter(page)).toHaveText('1 / 6')
})

test('R-216 · 첫 장에서 뒤로 넘기면 앞 권으로 돌아간다', async ({ page }) => {
  await openShelf(page)
  const titles = await importBooks(page, VOLUMES)
  await openReader(page, titles[1]!)

  await control.previous(page).click()

  await expect(page).toHaveURL(/\/book\/volume-1/)
  await expect(counter(page)).toHaveText('1 / 4')
})

test('R-216 · 책장의 끝에서는 제자리에 머문다', async ({ page }) => {
  await openShelf(page)
  const titles = await importBooks(page, VOLUMES)
  await openReader(page, titles[1]!)

  await control.last(page).click()
  await expect(counter(page)).toHaveText('6 / 6')

  await control.next(page).click()

  await expect(page).toHaveURL(/\/book\/volume-2/)
  await expect(counter(page)).toHaveText('6 / 6')
})
