/** S-142 · 라이트 테마 전체 배색. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { openShelf } from './fixture/app.ts'

/** 문서 바탕에 실제로 칠해진 색을 `rgb(r, g, b)` 문자열로 읽는다. */
const bodyColour = (page: Page, property: 'backgroundColor' | 'color'): Promise<string> =>
  page.evaluate((name) => getComputedStyle(document.body)[name], property)

/** `rgb(r, g, b)`의 밝기. 어느 쪽이 밝은지 견주는 데만 쓴다. */
const luminance = (colour: string): number => {
  const [r = 0, g = 0, b = 0] = colour.match(/\d+/g)?.map(Number) ?? []
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

test('S-142 · 라이트로 바꾸면 토큰이 실제로 덮인다', async ({ page }) => {
  await openShelf(page)

  const dark = await bodyColour(page, 'backgroundColor')
  const darkInk = await bodyColour(page, 'color')

  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  const light = await bodyColour(page, 'backgroundColor')
  const lightInk = await bodyColour(page, 'color')

  expect(light).not.toBe(dark)
  expect(lightInk).not.toBe(darkInk)

  // 바탕은 밝아지고 글자는 어두워진다. 토큰이 덮이지 않으면 둘 중 하나는 그대로다.
  expect(luminance(light)).toBeGreaterThan(luminance(dark))
  expect(luminance(lightInk)).toBeLessThan(luminance(darkInk))
})

test('S-142 · 고른 테마는 새로고침을 넘긴다', async ({ page }) => {
  await openShelf(page)
  await page.getByRole('button', { name: 'Switch to light theme' }).click()

  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()
})
