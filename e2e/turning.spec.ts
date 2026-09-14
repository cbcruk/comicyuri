/** R-207 · 다음 페이지가 그릴 수 있게 될 때까지 이전 페이지가 화면에 남는다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, readBook, stage } from './fixture/app.ts'

/**
 * 디코딩이 한 프레임을 넘기는 페이지. 단색이라 만들기는 빠르지만 픽셀이 많아서
 * 브라우저가 그리기까지는 시간이 든다. 가벼운 페이지로는 고치기 전에도 빈 프레임이
 * 생기지 않아 이 테스트가 아무것도 가리지 못한다.
 */
const HEAVY_BOOK = { fileName: 'volume-1.cbz', pageCount: 8, size: { width: 3200, height: 4800 } }

/** 매 프레임 페이지 상자에 이미지가 하나도 없었는지 적어 두기 시작한다. */
const recordBlankFrames = (page: Page) =>
  page.evaluate(() => {
    const blank = { frames: 0 }
    Object.assign(window, { blank })
    const sample = () => {
      const box = document.getElementById('reader-page')
      if (box === null || box.querySelector('img') === null) blank.frames += 1
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })

const blankFrames = (page: Page): Promise<unknown> =>
  page.evaluate(() => Reflect.get(Reflect.get(window, 'blank'), 'frames'))

test('R-207 · 멀리 건너뛰어도, 빠르게 넘겨도 화면이 비는 프레임이 없다', async ({ page }) => {
  await readBook(page, HEAVY_BOOK)
  await expect(stage(page).getByRole('img')).toBeVisible()
  await recordBlankFrames(page)

  // 미리 읽지 않은 곳으로 건너뛴다.
  await control.last(page).click()
  await expect(stage(page).getByRole('img', { name: 'Page 8' })).toBeVisible()
  await control.first(page).click()
  await expect(stage(page).getByRole('img', { name: 'Page 1' })).toBeVisible()

  // 답이 오기 전에 다시 넘긴다.
  for (let turn = 0; turn < 4; turn++) await control.next(page).click()
  await expect(stage(page).getByRole('img', { name: 'Page 5' })).toBeVisible()

  expect(await blankFrames(page)).toBe(0)
})
