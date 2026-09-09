/** R-251, R-272, R-291 · 시간과 브라우저 API가 걸린 것들. */

import { expect, test } from '@playwright/test'

import { control, readBook, stage } from './fixture/app.ts'

test('R-251 · 3초 동안 아무 일도 없으면 툴바가 사라지고, 다시 만지면 돌아온다', async ({
  page,
}) => {
  await readBook(page)
  const header = page.locator('header')

  await expect(header).toHaveAttribute('aria-hidden', 'false')
  await expect(header).toHaveAttribute('aria-hidden', 'true', { timeout: 6_000 })
  // 사라진 툴바는 탭 순서에서도 빠진다.
  await expect(header).toHaveClass(/pointer-events-none/)

  // 숨은 툴바는 접근성 트리에서도 빠지므로 버튼으로는 부를 수 없다. 화면 가운데를
  // 탭하는 것이 툴바를 다시 부르는 길이다.
  const box = await stage(page).boundingBox()
  await page.touchscreen.tap(640, (box?.y ?? 0) + (box?.height ?? 0) / 2)
  await expect(header).toHaveAttribute('aria-hidden', 'false')
})

test('R-251 · 포인터가 툴바 위에 있는 동안에는 시간이 흐르지 않는다', async ({ page }) => {
  await readBook(page)
  const header = page.locator('header')

  await header.hover()
  await page.waitForTimeout(4_500)
  await expect(header).toHaveAttribute('aria-hidden', 'false')

  // 벗어나면 대기가 처음부터 다시 간다.
  await stage(page).hover({ position: { x: 10, y: 10 } })
  await expect(header).toHaveAttribute('aria-hidden', 'true', { timeout: 6_000 })
})

test('R-272 · 패널을 여는 순간 썸네일이 채워진다', async ({ page }) => {
  await readBook(page)

  await control.everyPage(page).click()

  const panel = page.getByRole('dialog', { name: 'Every page' })
  await expect(panel).toBeVisible()
  // 컨테이너 높이가 측정되기 전에는 한 행도 그리지 않는다. 재고 나서 채워져야 한다.
  await expect(panel.locator('img').first()).toBeVisible({ timeout: 2_000 })
  await expect(panel.getByRole('button', { name: /^Go to page/ })).toHaveCount(6)
  await expect(panel.locator('img')).toHaveCount(6)
})

test('R-291 · Full 버튼이 전체화면을 오간다', async ({ page }) => {
  await readBook(page)

  await control.fullscreen(page).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
  await expect(control.fullscreen(page)).toHaveText('Exit full')

  await control.fullscreen(page).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false)
  await expect(control.fullscreen(page)).toHaveText('Full')
})

test('R-292 · 브라우저 쪽에서 나가도 상태가 맞는다', async ({ page }) => {
  await readBook(page)

  await control.fullscreen(page).click()
  await expect(control.fullscreen(page)).toHaveText('Exit full')

  // 앱을 거치지 않고 문서에서 직접 빠져나온다.
  await page.evaluate(() => document.exitFullscreen())

  await expect(control.fullscreen(page)).toHaveText('Full')
})
