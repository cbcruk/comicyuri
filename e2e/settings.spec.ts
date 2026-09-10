/** R-2B1 · 툴바에 버튼이 없던 설정들을 패널에서 바꾸고, 그것이 남는지. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, readBook, stage } from './fixture/app.ts'

const panel = (page: Page) => page.getByRole('dialog', { name: 'Reading settings' })
const coverAlone = (page: Page) => page.getByRole('switch', { name: 'Cover on its own' })

test('R-2B1 · ⚙ 버튼이 패널을 열고 닫는다', async ({ page }) => {
  await readBook(page)

  await expect(panel(page)).toHaveCount(0)
  await control.settings(page).click()
  await expect(panel(page)).toBeVisible()

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(panel(page)).toHaveCount(0)
})

test('R-2B1 · 표지를 혼자 두지 않기로 하면 배치가 바로 바뀌고 새로고침을 넘긴다', async ({
  page,
}) => {
  await readBook(page)
  await control.view(page).click()
  await expect(stage(page).getByRole('img')).toHaveCount(1)

  await control.settings(page).click()
  await coverAlone(page).click()
  await expect(coverAlone(page)).toHaveAttribute('aria-checked', 'false')

  // 패널이 열려 있어도 그 뒤의 화면은 이미 다시 묶였다.
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(stage(page).getByRole('img')).toHaveCount(2)

  await page.reload()
  await expect(stage(page).getByRole('img')).toHaveCount(2)
})

test('R-2B1 · 책 끝 동작을 고르면 그대로 남는다', async ({ page }) => {
  await readBook(page)

  await control.settings(page).click()
  await page.getByRole('button', { name: 'Stay put' }).click()
  await expect(page.getByRole('button', { name: 'Stay put' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.reload()
  await control.settings(page).click()
  await expect(page.getByRole('button', { name: 'Stay put' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
