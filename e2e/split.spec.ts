/** R-229 · 넓은 페이지를 좌우 반씩 읽는다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, counter, readBook, stage } from './fixture/app.ts'

const TALL = { width: 1200, height: 1800 }
const WIDE = { width: 3200, height: 1800 }

/** 4페이지만 양면 삽화인 여섯 쪽짜리 책. */
const BOOK = {
  fileName: 'volume-1.cbz',
  pageCount: 6,
  size: (page: number) => (page === 3 ? WIDE : TALL),
}

const imageBox = async (page: Page) => {
  const box = await stage(page).getByRole('img').boundingBox()
  if (box === null) throw new Error('페이지가 없다')
  return box
}

/** 반쪽을 잘라 내는 상자. 이미지는 이것의 두 배 너비로 그 안에 선다. */
const halfBox = async (page: Page) => {
  const box = await page.locator('#reader-page > div').boundingBox()
  if (box === null) throw new Error('반쪽 상자가 없다')
  return box
}

/** 설정 패널에서 반씩 읽기를 켠다. */
const readInHalves = async (page: Page): Promise<void> => {
  const panel = page.getByRole('dialog', { name: 'Reading settings' })

  await control.settings(page).click()
  await panel.getByRole('switch', { name: 'Read wide pages in halves' }).click()
  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toBeHidden()
}

/** 넓은 4페이지까지 간다. */
const goToWidePage = async (page: Page): Promise<void> => {
  for (let turn = 0; turn < 3; turn++) await control.next(page).click()
  await expect(counter(page)).toHaveText('4 / 6')
}

test('R-229 · 넓은 페이지가 두 걸음으로 나뉜다', async ({ page }) => {
  await readBook(page, BOOK)
  await readInHalves(page)
  await goToWidePage(page)

  // 오른쪽에서 왼쪽으로 읽으므로 오른쪽 반이 먼저다. 이미지는 상자만큼 왼쪽에 걸린다.
  const clip = await halfBox(page)
  const first = await imageBox(page)
  expect(first.width).toBeCloseTo(clip.width * 2, 0)
  expect(first.x).toBeCloseTo(clip.x - clip.width, 0)

  await control.next(page).click()

  // 같은 페이지의 다른 반쪽이다. 카운터는 그대로다.
  await expect(counter(page)).toHaveText('4 / 6')
  await expect(async () => {
    const second = await imageBox(page)
    expect(second.x).toBeCloseTo(clip.x, 0)
  }).toPass()

  await control.next(page).click()
  await expect(counter(page)).toHaveText('5 / 6')
})

test('R-229 · 뒤로 넘겨 오면 나중에 읽는 반쪽이 나온다', async ({ page }) => {
  await readBook(page, BOOK)
  await readInHalves(page)
  await goToWidePage(page)
  await control.next(page).click()
  await control.next(page).click()
  await expect(counter(page)).toHaveText('5 / 6')

  await control.previous(page).click()
  await expect(counter(page)).toHaveText('4 / 6')

  // 왼쪽 반, 즉 오른쪽에서 왼쪽으로 읽을 때 나중에 읽는 쪽이다.
  await expect(async () => {
    const clip = await halfBox(page)
    const image = await imageBox(page)
    expect(image.x).toBeCloseTo(clip.x, 0)
  }).toPass()
})

test('R-229 · 반쪽은 화면 안에 통째로 들어간다', async ({ page }) => {
  await readBook(page, BOOK)
  await readInHalves(page)
  await goToWidePage(page)

  const room = await stage(page).boundingBox()
  const clip = await halfBox(page)

  expect(clip.width).toBeLessThanOrEqual((room?.width ?? 0) - 16 + 1)
  expect(clip.height).toBeCloseTo((room?.height ?? 0) - 16, 0)
  // 반쪽의 비는 페이지의 절반이다.
  expect(clip.width / clip.height).toBeCloseTo(WIDE.width / 2 / WIDE.height, 1)
})

test('R-229 · 끄면 넓은 페이지가 한 걸음이다', async ({ page }) => {
  await readBook(page, BOOK)
  await goToWidePage(page)

  await control.next(page).click()
  await expect(counter(page)).toHaveText('5 / 6')
})
