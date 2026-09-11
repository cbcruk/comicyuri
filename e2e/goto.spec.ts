/** R-266 · 번호를 적어 그 페이지로 간다. R-2C1 · 슬라이드쇼. */

import { expect, test } from '@playwright/test'

import { control, counter, readBook } from './fixture/app.ts'

const BOOK = { fileName: 'volume-1.cbz', pageCount: 12 }

const goTo = (page: import('@playwright/test').Page) =>
  page.getByRole('spinbutton', { name: 'Go to page' })

test('R-266 · 번호를 적고 Enter를 누르면 그 페이지로 간다', async ({ page }) => {
  await readBook(page, BOOK)

  await goTo(page).fill('7')
  await goTo(page).press('Enter')
  await expect(counter(page)).toHaveText('7 / 12')

  // 책 밖의 번호는 아무 일도 일으키지 않는다.
  await goTo(page).fill('99')
  await goTo(page).press('Enter')
  await expect(counter(page)).toHaveText('7 / 12')
})

test('R-266 · 번호를 적는 동안 화살표는 페이지를 넘기지 않는다', async ({ page }) => {
  await readBook(page, BOOK)

  await goTo(page).click()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')

  await expect(counter(page)).toHaveText('1 / 12')
})

test('R-2C1 · 슬라이드쇼가 스스로 페이지를 넘긴다', async ({ page }) => {
  await readBook(page, BOOK)

  // 가장 짧은 간격으로 줄여 둔다.
  const panel = page.getByRole('dialog', { name: 'Reading settings' })
  await control.settings(page).click()
  for (let step = 0; step < 3; step++) {
    await panel.getByRole('button', { name: 'Spend less time on a page' }).click()
  }
  await expect(panel.getByText('2s')).toBeVisible()
  await panel.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Start the slideshow' }).click()
  await expect(counter(page)).toHaveText('2 / 12', { timeout: 10000 })
  await expect(counter(page)).toHaveText('3 / 12', { timeout: 10000 })

  // 도는 동안 툴바는 숨어 있다. 멈추는 것은 키가 맡는다.
  await page.keyboard.press('p')
  const stopped = await counter(page).textContent()
  await page.waitForTimeout(3000)
  await expect(counter(page)).toHaveText(stopped ?? '')
})
