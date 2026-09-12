/**
 * R-276 · 썸네일 격자가 창 너비를 따라간다. 몇 칸이 서는지는 레이아웃이 정하므로
 * 브라우저에서만 드러난다.
 */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, readBook } from './fixture/app.ts'

/** 지금 한 행에 서 있는 칸의 수와 좌우 여백. */
const rowOf = (page: Page) =>
  page.evaluate(() => {
    const row = document.querySelector('[role="dialog"] div.mx-auto.flex')
    const cells = row ? Array.from(row.children) : []
    const boxes = cells.map((cell) => cell.getBoundingClientRect())
    const first = boxes[0]
    const last = boxes[boxes.length - 1]
    return {
      perRow: cells.length,
      left: first ? Math.round(first.left) : 0,
      right: last ? Math.round(window.innerWidth - last.right) : 0,
    }
  })

const openGrid = async (page: Page): Promise<void> => {
  await readBook(page, { fileName: 'volume-1.cbz', pageCount: 24 })
  await control.everyPage(page).click()
  await expect(page.getByRole('button', { name: 'Go to page 1', exact: true })).toBeVisible()
}

test('R-276 · 넓은 창에는 더 많은 칸이 선다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openGrid(page)
  const narrow = await rowOf(page)

  await page.setViewportSize({ width: 1680, height: 1050 })
  await expect.poll(async () => (await rowOf(page)).perRow).toBeGreaterThan(narrow.perRow)
})

test('R-276 · 격자가 한쪽으로 몰리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 })
  await openGrid(page)

  const { left, right } = await rowOf(page)

  // 열의 너비는 고정이라 남는 자리가 생긴다. 그것을 양쪽에 고르게 둔다.
  expect(Math.abs(left - right)).toBeLessThanOrEqual(16)
})

test('R-276 · 좁은 창에서도 격자는 격자로 남는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await openGrid(page)

  expect((await rowOf(page)).perRow).toBeGreaterThanOrEqual(2)
})
