/**
 * R-276 · 썸네일 격자가 창 너비를 따라간다. 몇 칸이 서는지는 레이아웃이 정하므로
 * 브라우저에서만 드러난다.
 */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { openMenu, readBook } from './fixture/app.ts'

/**
 * 썸네일 격자를 여닫는다.
 *
 * `use(page, 'everyPage')`를 쓰지 못한다. 이 항목은 상태를 지므로
 * `menuitemcheckbox`인데, 픽스처의 `openMenu`는 이름에 `bookmark`·`fullscreen`·
 * `slideshow`가 든 것만 그 역할로 찾기 때문이다.
 */
const useEveryPage = async (page: Page): Promise<void> => {
  await openMenu(page, 'everyPage')
  await page.getByRole('menuitemcheckbox', { name: 'Show every page' }).click()
}

/** 지금 한 행에 서 있는 칸의 수와 좌우 여백. */
const rowOf = (page: Page) =>
  page.evaluate(() => {
    const row = document.querySelector('[role="dialog"] [data-thumb-row]')
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
  await useEveryPage(page)
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

test('R-276 · 칸이 넓어지면 행도 그만큼 높아진다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openGrid(page)

  const measured = await page.evaluate(() => {
    const row = document.querySelector('[role="dialog"] [data-thumb-row]')
    const cell = row?.firstElementChild?.getBoundingClientRect()
    const rows = Array.from(document.querySelectorAll('[role="dialog"] [data-thumb-row]'))
    const first = rows[0]?.getBoundingClientRect()
    const second = rows[1]?.getBoundingClientRect()
    return {
      cellWidth: cell ? Math.round(cell.width) : 0,
      rowHeight: first && second ? Math.round(second.top - first.top) : 0,
    }
  })

  // 행 높이가 칸 너비를 따라간다. 고정된 180이 아니다.
  expect(measured.cellWidth).toBeGreaterThan(104)
  expect(measured.rowHeight).toBeGreaterThan(180)
})

test('R-276 · 좁은 창에서도 격자는 격자로 남는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await openGrid(page)

  expect((await rowOf(page)).perRow).toBeGreaterThanOrEqual(2)
})
