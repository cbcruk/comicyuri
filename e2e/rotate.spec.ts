/** R-228 · 페이지를 세우면 맞춤이 눕힌 상자를 따르고, 그 각도가 책에 남는다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, openReader, readBook, stage } from './fixture/app.ts'

/** 세로로 긴 페이지. 눕혀 스캔된 책이 바로 이 모양으로 들어온다. */
const BOOK = { fileName: 'volume-1.cbz', pageCount: 6, size: { width: 1600, height: 2400 } }

/** 스테이지가 페이지에 실제로 내주는 상자. `p-2`(8px)만큼 안쪽이다. */
const roomOf = async (page: Page) => {
  const box = await stage(page).boundingBox()
  if (box === null) throw new Error('스테이지가 없다')
  return { width: box.width - 16, height: box.height - 16 }
}

/** 화면에 걸린 페이지가 차지하는 자리. 세운 페이지는 눕힌 만큼 넓어진다. */
const imageBox = async (page: Page) => {
  const box = await stage(page).getByRole('img').boundingBox()
  if (box === null) throw new Error('페이지가 없다')
  return box
}

test('R-228 · 세운 페이지는 눕힌 상자에 맞춰진다', async ({ page }) => {
  await readBook(page, BOOK)

  const room = await roomOf(page)
  const before = await imageBox(page)
  expect(before.height).toBeGreaterThan(before.width)

  await control.rotate(page).click()

  await expect(async () => {
    const after = await imageBox(page)

    // 눕혔으니 화면에서는 가로가 길다.
    expect(after.width).toBeGreaterThan(after.height)
    // 그리고 맞춤이 눕힌 상자를 따랐으므로 화면 높이를 다 쓴다. 상자를 그대로 둔
    // 채 돌리기만 했다면 여기서 훨씬 작게 나온다.
    expect(after.height).toBeCloseTo(room.height, 0)
    expect(after.width).toBeLessThanOrEqual(room.width + 1)
  }).toPass()
})

test('R-228 · 네 번 세우면 제자리로 돌아온다', async ({ page }) => {
  await readBook(page, BOOK)

  const before = await imageBox(page)
  for (let turn = 0; turn < 4; turn++) await control.rotate(page).click()

  await expect(async () => {
    const after = await imageBox(page)
    expect(after.width).toBeCloseTo(before.width, 0)
    expect(after.height).toBeCloseTo(before.height, 0)
  }).toPass()
})

test('R-228 · 세워 둔 각도는 그 책에 남는다', async ({ page }) => {
  const title = await readBook(page, BOOK)
  await control.rotate(page).click()

  const rotated = page.locator('#reader-page')
  await expect(rotated).toHaveAttribute('style', /rotate\(90deg\)/)

  await page.reload()
  await expect(page.locator('#reader-page')).toHaveAttribute('style', /rotate\(90deg\)/)

  // 책장을 거쳐 다시 들어와도 세워져 있다.
  await control.shelf(page).click()
  await openReader(page, title)
  await expect(page.locator('#reader-page')).toHaveAttribute('style', /rotate\(90deg\)/)
})
