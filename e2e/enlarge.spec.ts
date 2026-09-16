/** R-2B4 · 작은 페이지를 화면에 맞춰 늘릴지. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { openMenu, readBook, readMenuItem, stage, use } from './fixture/app.ts'

/**
 * 설정 패널을 여닫는다.
 *
 * `use(page, 'settings')`를 쓰지 못한다. 이 항목은 상태를 지므로
 * `menuitemcheckbox`인데, 픽스처의 `openMenu`는 이름에 `bookmark`·`fullscreen`·
 * `slideshow`가 든 것만 그 역할로 찾기 때문이다. 픽스처가 그것을 알게 되면
 * 이 helper는 `use(page, 'settings')` 한 줄로 줄어든다.
 */
const useSettings = async (page: Page): Promise<void> => {
  await openMenu(page, 'settings')
  await page.getByRole('menuitemcheckbox', { name: 'Reading settings' }).click()
}

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

/**
 * 맞춤 항목이 곁글에 적고 있는 지금 모드. 예전에는 툴바 버튼의 글자였다.
 */
const expectFit = (page: Page, value: string) =>
  readMenuItem(page, 'fit', async (item) => {
    await expect(item.locator('span[aria-hidden="true"] > span')).toHaveText(value)
  })

/** 설정 패널에서 늘리기 스위치를 끈다. */
const stopStretching = async (page: Page): Promise<void> => {
  await useSettings(page)
  await page.getByRole('switch', { name: 'Stretch small pages to fit' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
}

test('R-2B4 · 켜 두면 작은 페이지가 너비를 채운다', async ({ page }) => {
  await readBook(page, BOOK)
  await use(page, 'fit')
  await expectFit(page, 'Width')

  const image = await imageBox(page)
  expect(image.width).toBeCloseTo(await roomWidth(page), 0)
  expect(image.width).toBeGreaterThan(SMALL.width)
})

test('R-2B4 · 끄면 원래 크기를 넘지 않는다', async ({ page }) => {
  await readBook(page, BOOK)
  await use(page, 'fit')
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
  await use(page, 'fit')
  await stopStretching(page)

  await page.reload()
  await expectFit(page, 'Width')
  await expect(async () => {
    expect((await imageBox(page)).width).toBeCloseTo(SMALL.width, 0)
  }).toPass()
})
