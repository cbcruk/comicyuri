/** R-2B4 · 작은 페이지를 화면에 맞춰 늘릴지. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, readBook, stage } from './fixture/app.ts'

/** 화면보다 훨씬 작은 저해상도 스캔본. */
const SMALL = { width: 240, height: 360 }
const BOOK = { fileName: 'volume-1.cbz', pageCount: 6, size: SMALL }

const imageBox = async (page: Page) => {
  const box = await stage(page).getByRole('img').boundingBox()
  if (box === null) throw new Error('페이지가 없다')
  return box
}

const roomWidth = async (page: Page) => {
  const box = await stage(page).boundingBox()
  if (box === null) throw new Error('스테이지가 없다')
  return box.width - 16
}

/** 설정 패널에서 늘리기 스위치를 끈다. */
const stopStretching = async (page: Page): Promise<void> => {
  await control.settings(page).click()
  await page.getByRole('switch', { name: 'Stretch small pages to fit' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
}

test('R-2B4 · 켜 두면 작은 페이지가 너비를 채운다', async ({ page }) => {
  await readBook(page, BOOK)
  await control.fit(page).click()
  await expect(control.fit(page)).toHaveText('Width')

  const image = await imageBox(page)
  expect(image.width).toBeCloseTo(await roomWidth(page), 0)
  expect(image.width).toBeGreaterThan(SMALL.width)
})

test('R-2B4 · 끄면 원래 크기를 넘지 않는다', async ({ page }) => {
  await readBook(page, BOOK)
  await control.fit(page).click()
  await stopStretching(page)

  await expect(async () => {
    const image = await imageBox(page)
    expect(image.width).toBeCloseTo(SMALL.width, 0)
    expect(image.height).toBeCloseTo(SMALL.height, 0)
  }).toPass()
})

test('R-224 · 통째로 맞춤은 켜 두어도 작은 페이지를 늘리지 않는다', async ({ page }) => {
  await readBook(page, BOOK)

  const image = await imageBox(page)
  expect(image.width).toBeCloseTo(SMALL.width, 0)
  expect(image.height).toBeCloseTo(SMALL.height, 0)
})

test('R-2B4 · 끈 것은 새로고침을 넘긴다', async ({ page }) => {
  await readBook(page, BOOK)
  await control.fit(page).click()
  await stopStretching(page)

  await page.reload()
  await expect(control.fit(page)).toHaveText('Width')
  await expect(async () => {
    expect((await imageBox(page)).width).toBeCloseTo(SMALL.width, 0)
  }).toPass()
})
