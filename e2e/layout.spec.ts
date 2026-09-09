/** R-224 · 맞춤 모드가 실제로 그렇게 보이는지, 그리고 스테이지가 높이를 다 쓰는지. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, readBook, stage } from './fixture/app.ts'

// 실제 만화 페이지처럼 화면보다 큰 크기. 맞춤 모드는 줄이는 쪽으로 일한다.
const PAGE_SIZE = { width: 1600, height: 2400 }

/** 스테이지가 페이지에 실제로 내주는 상자. `p-2`(8px)만큼 안쪽이다. */
const stageBox = async (page: Page) => {
  const box = await stage(page).boundingBox()
  if (box === null) throw new Error('스테이지가 없다')
  return { width: box.width - 16, height: box.height - 16 }
}

const imageBox = async (page: Page) => {
  const box = await stage(page).getByRole('img').boundingBox()
  if (box === null) throw new Error('페이지가 없다')
  return box
}

test('스테이지는 툴바와 푸터를 뺀 높이를 다 쓴다', async ({ page }) => {
  await readBook(page, { fileName: 'volume-1.cbz', pageCount: 6, size: PAGE_SIZE })

  const viewport = page.viewportSize()
  const header = await page.locator('header').boundingBox()
  const footer = await page.locator('footer').boundingBox()
  const box = await stage(page).boundingBox()

  expect(box?.height).toBeCloseTo(
    (viewport?.height ?? 0) - (header?.height ?? 0) - (footer?.height ?? 0),
    0,
  )
})

test('R-224 · Fit은 페이지를 화면 안에 통째로 넣는다', async ({ page }) => {
  await readBook(page, { fileName: 'volume-1.cbz', pageCount: 6, size: PAGE_SIZE })

  const room = await stageBox(page)
  const image = await imageBox(page)

  expect(image.width).toBeLessThanOrEqual(room.width + 1)
  expect(image.height).toBeLessThanOrEqual(room.height + 1)
  // 세로로 긴 페이지라 높이가 먼저 닿는다. 그래서 Fit과 Height는 이 페이지에서
  // 같은 그림이 된다 — 정의상 Fit은 둘 중 먼저 닿는 쪽을 따른다.
  expect(image.height).toBeCloseTo(room.height, 0)
  expect(image.width / image.height).toBeCloseTo(PAGE_SIZE.width / PAGE_SIZE.height, 1)
})

test('R-224 · Width는 너비를 채운다', async ({ page }) => {
  await readBook(page, { fileName: 'volume-1.cbz', pageCount: 6, size: PAGE_SIZE })
  await control.fit(page).click()
  await expect(control.fit(page)).toHaveText('Width')

  const room = await stageBox(page)
  const image = await imageBox(page)

  expect(image.width).toBeCloseTo(room.width, 0)
})

test('R-224 · Height는 높이를 채운다', async ({ page }) => {
  await readBook(page, { fileName: 'volume-1.cbz', pageCount: 6, size: PAGE_SIZE })
  await control.fit(page).click()
  await control.fit(page).click()
  await expect(control.fit(page)).toHaveText('Height')

  const room = await stageBox(page)
  const image = await imageBox(page)

  expect(image.height).toBeCloseTo(room.height, 0)
})

test('R-224 · 1:1은 원래 픽셀 크기로 둔다', async ({ page }) => {
  await readBook(page, { fileName: 'volume-1.cbz', pageCount: 6, size: PAGE_SIZE })
  await control.fit(page).click()
  await control.fit(page).click()
  await control.fit(page).click()
  await expect(control.fit(page)).toHaveText('1:1')

  const image = await imageBox(page)

  expect(image.width).toBeCloseTo(PAGE_SIZE.width, 0)
  expect(image.height).toBeCloseTo(PAGE_SIZE.height, 0)
})
