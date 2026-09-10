/** R-240·R-246·R-247 · 굴려서 읽고, 끝에 닿으면 넘기고, 들어선 쪽에서 시작한다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, counter, readBook, stage } from './fixture/app.ts'

/** 너비를 채우면 화면보다 훨씬 길어지는 페이지. */
const TALL_BOOK = { fileName: 'volume-1.cbz', pageCount: 6, size: { width: 800, height: 4000 } }

/** 한 번의 굴림이 끝났다고 보는 시간보다 넉넉히 쉰다. */
const PAUSE = 400

const boxOf = async (page: Page, what: 'stage' | 'image') => {
  const box = await (what === 'stage' ? stage(page) : stage(page).getByRole('img')).boundingBox()
  if (box === null) throw new Error(`${what}가 없다`)
  return box
}

/**
 * 페이지의 끝까지 굴린다. 한 번의 굴림으로 친다 — 끝에 닿는 그 이벤트는 남은 거리만
 * 움직이고 페이지를 넘기지 않는다.
 */
const scrollToBottom = async (page: Page): Promise<void> => {
  const stageBox = await boxOf(page, 'stage')
  const bottom = stageBox.y + stageBox.height - 8

  for (let step = 0; step < 20; step++) {
    const image = await boxOf(page, 'image')
    const left = image.y + image.height - bottom
    if (left < 1) return
    await page.mouse.wheel(0, Math.min(left, 2000))
  }

  throw new Error('페이지 끝까지 굴리지 못했다')
}

/** 페이지를 너비에 맞춘 채로 연다. 그래야 화면보다 길어져 굴릴 것이 생긴다. */
const readTall = async (page: Page): Promise<void> => {
  await readBook(page, TALL_BOOK)
  await control.fit(page).click()
  await expect(control.fit(page)).toHaveText('Width')

  const box = await boxOf(page, 'stage')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
}

test('R-247 · 앞으로 넘겨 온 긴 페이지는 첫 줄부터 보인다', async ({ page }) => {
  await readTall(page)

  const stageBox = await boxOf(page, 'stage')
  const image = await boxOf(page, 'image')

  // `p-2`(8px) 안쪽이 스테이지가 페이지에 내주는 자리다.
  expect(image.y).toBeCloseTo(stageBox.y + 8, 0)
  expect(image.height).toBeGreaterThan(stageBox.height)
})

test('R-240 · 굴리면 페이지가 그만큼 움직인다', async ({ page }) => {
  await readTall(page)

  const before = await boxOf(page, 'image')
  await page.mouse.wheel(0, 200)
  await expect(async () => {
    const after = await boxOf(page, 'image')
    expect(after.y).toBeCloseTo(before.y - 200, 0)
  }).toPass()

  await expect(counter(page)).toHaveText('1 / 6')
})

test('R-246 · 끝에 닿은 뒤 다시 굴리면 페이지가 넘어간다', async ({ page }) => {
  await readTall(page)

  const stageBox = await boxOf(page, 'stage')
  await scrollToBottom(page)

  // 끝에 닿기까지 굴린 그 이벤트로는 넘어가지 않는다.
  await expect(counter(page)).toHaveText('1 / 6')

  await page.waitForTimeout(PAUSE)
  await page.mouse.wheel(0, 120)
  await expect(counter(page)).toHaveText('2 / 6')

  // 넘어간 페이지는 다시 첫 줄부터다.
  await expect(async () => {
    const image = await boxOf(page, 'image')
    expect(image.y).toBeCloseTo(stageBox.y + 8, 0)
  }).toPass()
})

test('R-247 · 뒤로 넘겨 온 긴 페이지는 끝에서 시작한다', async ({ page }) => {
  await readTall(page)

  await scrollToBottom(page)
  await page.waitForTimeout(PAUSE)
  await page.mouse.wheel(0, 120)
  await expect(counter(page)).toHaveText('2 / 6')

  // 두 번째 페이지의 첫 줄에 서 있으므로, 위로 굴리는 것이 곧 되돌아가는 것이다.
  await page.waitForTimeout(PAUSE)
  await page.mouse.wheel(0, -120)
  await expect(counter(page)).toHaveText('1 / 6')

  const stageBox = await boxOf(page, 'stage')
  await expect(async () => {
    const image = await boxOf(page, 'image')
    expect(image.y + image.height).toBeCloseTo(stageBox.y + stageBox.height - 8, 0)
  }).toPass()
})

test('R-246 · 화면에 통째로 들어가는 페이지는 한 번 굴리면 넘어간다', async ({ page }) => {
  await readBook(page, TALL_BOOK)

  const box = await boxOf(page, 'stage')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  await expect(counter(page)).toHaveText('1 / 6')
  await page.mouse.wheel(0, 120)
  await expect(counter(page)).toHaveText('2 / 6')
})

test('격자 위에서 굴리는 것은 격자를 굴린다', async ({ page }) => {
  // 격자는 스테이지 밖에 있으므로 리더가 그 굴림을 가져가지 않는다. 가져가면
  // 격자를 훑는 동안 뒤에서 페이지가 넘어간다.
  await readBook(page, { fileName: 'volume-1.cbz', pageCount: 40 })
  await control.everyPage(page).click()

  const grid = page.locator('#reader-thumbs')
  const box = await grid.boundingBox()
  if (box === null) throw new Error('격자가 없다')

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 400)

  await expect(async () => {
    expect(await grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  }).toPass()

  await expect(counter(page)).toHaveText('1 / 40')
})
