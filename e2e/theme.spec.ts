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

test('S-142 · 테마를 바꾸면 Astryx 컴포넌트도 새로고침 없이 따라온다', async ({ page }) => {
  await openShelf(page)
  const openFiles = page.getByRole('button', { name: 'Open files' })
  const colours = () =>
    openFiles.evaluate((element) => {
      const style = getComputedStyle(element)
      return `${style.color} on ${style.backgroundColor}`
    })

  const dark = await colours()
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  // 속성은 곧바로 바뀌지만 컴포넌트는 React가 다시 그린 뒤에 따라온다.
  await expect.poll(colours).not.toBe(dark)
  const toggled = await colours()

  // 새로고침한 뒤의 색이 정답이다. 토글만으로 거기에 닿아 있어야 한다 — 앱을 켤 때 읽은 모드를
  // `Theme`에 한 번 넘기면, 토글한 뒤에도 켤 때의 모드에 머물러 글자가 바탕에 묻힌다.
  await page.reload()
  await expect(openFiles).toBeVisible()
  const reloaded = await colours()

  expect(toggled).toBe(reloaded)
})

test('S-142 · 고른 테마는 새로고침을 넘긴다', async ({ page }) => {
  await openShelf(page)
  await page.getByRole('button', { name: 'Switch to light theme' }).click()

  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()
})

/**
 * S-144 · 첫 프레임이 이미 고른 테마다.
 *
 * 앱이 뜨기 전에는 `index.html`이 지고 있는 것이 화면이다. 그래서 모듈을 길에서
 * 붙잡아 두고, 그동안 무엇이 그려져 있는지 본다.
 */
const beforeTheAppBoots = async (page: Page) => {
  await page.route(/assets\/.*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })

  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForSelector('body')

  return page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    background: getComputedStyle(document.body).backgroundColor,
    themeColour: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    // 앱이 아직 아무것도 그리지 않았다는 증거.
    booted: document.querySelector('#root')?.childElementCount ?? 0,
  }))
}

test('S-144 · 라이트를 고른 사람은 어두운 첫 프레임을 보지 않는다', async ({ page }) => {
  await openShelf(page)
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  const early = await beforeTheAppBoots(page)

  expect(early.booted).toBe(0)
  expect(early.theme).toBe('light')
  expect(early.background).toBe('rgb(241, 241, 241)')
  expect(early.themeColour).toBe('#f1f1f1')
})

test('S-144 · 다크를 고른 사람의 첫 프레임은 그대로 어둡다', async ({ page }) => {
  await openShelf(page)

  const early = await beforeTheAppBoots(page)

  expect(early.booted).toBe(0)
  expect(early.theme).toBe('dark')
  expect(early.background).toBe('rgb(27, 27, 27)')
})

test('S-144 · 테마를 바꾸면 브라우저에 알리는 색도 함께 간다', async ({ page }) => {
  await openShelf(page)
  const meta = page.locator('meta[name="theme-color"]')

  await expect(meta).toHaveAttribute('content', '#1b1b1b')
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(meta).toHaveAttribute('content', '#f1f1f1')
})
