/** R-2A5 · Shift가 넘김 키를 크게 만든다. */

import { expect, test } from '@playwright/test'

import { counter, readBook } from './fixture/app.ts'

/** 건너뛰기가 끝에 닿지 않을 만큼 긴 책. */
const BOOK = { fileName: 'volume-1.cbz', pageCount: 30 }

test('R-2A5 · Shift와 함께 누른 넘김 키가 열 장을 건너뛴다', async ({ page }) => {
  await readBook(page, BOOK)
  await expect(counter(page)).toHaveText('1 / 30')

  // 오른쪽에서 왼쪽으로 읽으므로 왼쪽이 앞이다.
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(counter(page)).toHaveText('11 / 30')

  await page.keyboard.press('Shift+ArrowLeft')
  await expect(counter(page)).toHaveText('21 / 30')

  await page.keyboard.press('Shift+ArrowRight')
  await expect(counter(page)).toHaveText('11 / 30')
})

test('R-2A5 · 건너뛰기는 책의 끝에서 멈춘다', async ({ page }) => {
  await readBook(page, BOOK)

  await page.keyboard.press('Shift+ArrowRight')
  await expect(counter(page)).toHaveText('1 / 30')

  await page.keyboard.press('End')
  await expect(counter(page)).toHaveText('30 / 30')

  await page.keyboard.press('Shift+ArrowLeft')
  await expect(counter(page)).toHaveText('30 / 30')
})

test('R-2A5 · Shift+Space는 뒤로 간다', async ({ page }) => {
  await readBook(page, BOOK)

  await page.keyboard.press('Space')
  await expect(counter(page)).toHaveText('2 / 30')

  await page.keyboard.press('Shift+Space')
  await expect(counter(page)).toHaveText('1 / 30')
})
