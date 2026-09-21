/** S-151 · 브라우저가 한국어로 말하면 화면도 한국어다. */

import { expect, test } from '@playwright/test'

import { readBook } from './fixture/app.ts'

test.use({ locale: 'ko-KR' })

test('S-151 · 한국어 브라우저에서는 메뉴가 한국어로 선다', async ({ page }) => {
  await readBook(page)

  const names = await page
    .locator('[role="menubar"] > [role="menuitem"]')
    .evaluateAll((items) => items.map((item) => item.textContent))
  expect(names).toEqual(['책', '보기', '이동', '재생', '설정'])

  await page.getByRole('menuitem', { name: '보기', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '메뉴바 숨기기' })).toBeVisible()
})

test('S-151 · 문서의 언어도 한국어가 된다', async ({ page }) => {
  await readBook(page)

  await expect(page.locator('html')).toHaveAttribute('lang', 'ko-KR')
})
