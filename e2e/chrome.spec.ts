/** R-251, R-252, R-272, R-291 · 툴바, 시간과 브라우저 API가 걸린 것들. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { readBook, readMenuItem, stage, use } from './fixture/app.ts'

/**
 * 전체화면 항목이 지금 어느 쪽을 말하고 있는지 본다. 예전 툴바 버튼은 `Full`과
 * `Exit full`로 갈렸고, 메뉴 항목은 같은 것을 제 이름으로 말한다.
 */
const expectFullscreenItem = (page: Page, name: string): Promise<void> =>
  readMenuItem(page, 'fullscreen', async (item) => {
    await expect(item).toHaveAccessibleName(name)
  })

test('R-251 · 가만히 두어도 툴바가 사라지지 않는다', async ({ page }) => {
  await readBook(page)
  const header = page.locator('header')
  await expect(header).toBeVisible()

  // 예전의 자동 숨김은 3초였다. 그보다 넉넉히 기다려도 그대로다.
  await page.waitForTimeout(4_500)
  await expect(header).toBeVisible()
  await expect(page.locator('footer')).toBeVisible()
})

test('R-252 · `h` 키가 툴바를 숨기면 스테이지가 그 높이를 가져가고, 다시 누르면 돌아온다', async ({
  page,
}) => {
  await readBook(page)
  const header = page.locator('header')
  const before = (await stage(page).boundingBox())?.height ?? 0

  await page.keyboard.press('h')
  await expect(header).toHaveCount(0)
  await expect(page.locator('footer')).toHaveCount(0)
  // 흐려진 채 자리를 차지하는 것이 아니라 빠진다.
  await expect
    .poll(async () => (await stage(page).boundingBox())?.height ?? 0)
    .toBeGreaterThan(before)

  // 넘김 키는 숨긴 툴바를 되부르지 않는다.
  await page.keyboard.press('ArrowLeft')
  await expect(header).toHaveCount(0)

  await page.keyboard.press('h')
  await expect(header).toBeVisible()
})

test('R-252 · `Hide` 버튼으로 숨긴 툴바는 가운데 탭으로 돌아온다', async ({ page }) => {
  await readBook(page)
  const header = page.locator('header')

  await use(page, 'hideToolbar')
  await expect(header).toHaveCount(0)

  const box = await stage(page).boundingBox()
  await page.touchscreen.tap(640, (box?.y ?? 0) + (box?.height ?? 0) / 2)
  await expect(header).toBeVisible()
})

test('R-272 · 패널을 여는 순간 썸네일이 채워진다', async ({ page }) => {
  await readBook(page)

  await use(page, 'everyPage')

  const panel = page.getByRole('dialog', { name: 'Every page' })
  await expect(panel).toBeVisible()
  // 컨테이너 높이가 측정되기 전에는 한 행도 그리지 않는다. 재고 나서 채워져야 한다.
  await expect(panel.locator('img').first()).toBeVisible({ timeout: 2_000 })
  await expect(panel.getByRole('button', { name: /^Go to page/ })).toHaveCount(6)
  await expect(panel.locator('img')).toHaveCount(6)
})

test('R-291 · Full 버튼이 전체화면을 오간다', async ({ page }) => {
  await readBook(page)

  await use(page, 'fullscreen')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
  await expectFullscreenItem(page, 'Leave fullscreen')

  await use(page, 'fullscreen')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false)
  await expectFullscreenItem(page, 'Enter fullscreen')
})

test('R-292 · 브라우저 쪽에서 나가도 상태가 맞는다', async ({ page }) => {
  await readBook(page)

  await use(page, 'fullscreen')
  await expectFullscreenItem(page, 'Leave fullscreen')

  // 앱을 거치지 않고 문서에서 직접 빠져나온다.
  await page.evaluate(() => document.exitFullscreen())

  await expectFullscreenItem(page, 'Enter fullscreen')
})
