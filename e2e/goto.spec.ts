/** R-266 · 번호를 적어 그 페이지로 간다. R-2C1 · 슬라이드쇼. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { counter, openGoToPage, openMenu, readBook, stage, use } from './fixture/app.ts'

/**
 * 설정 패널을 여닫는다.
 *
 * `use(page, 'settings')`를 쓰지 못한다. 이 항목은 상태를 지므로
 * `menuitemcheckbox`인데, 픽스처의 `openMenu`는 이름에 `bookmark`·`fullscreen`·
 * `slideshow`가 든 것만 그 역할로 찾기 때문이다. 픽스처가 그것을 알게 되면
 * 이 helper는 `use(page, 'settings')` 한 줄로 줄어든다.
 */
const useSettings = async (page: Page): Promise<void> => {
  await openMenu(page, 'settings')
  await page.getByRole('menuitemcheckbox', { name: 'Reading settings' }).click()
}

const BOOK = { fileName: 'volume-1.cbz', pageCount: 12 }

test('R-266 · 번호를 적고 Enter를 누르면 그 페이지로 간다', async ({ page }) => {
  await readBook(page, BOOK)

  const box = await openGoToPage(page)
  await box.fill('7')
  await box.press('Enter')
  await expect(counter(page)).toHaveText('7 / 12')

  // 책 밖의 번호는 아무 일도 일으키지 않는다.
  const again = await openGoToPage(page)
  await again.fill('99')
  await again.press('Enter')
  await expect(counter(page)).toHaveText('7 / 12')
})

test('R-266 · Go 메뉴의 Go to page가 번호 입력란을 연다', async ({ page }) => {
  await readBook(page, BOOK)

  await use(page, 'goToPage')
  await expect(page.getByRole('spinbutton', { name: /^Page/ })).toBeFocused()
  await page.keyboard.type('5')
  await page.keyboard.press('Enter')
  await expect(counter(page)).toHaveText('5 / 12')
})

test('R-266 · 창 안의 버튼에서 누른 Escape는 창만 닫고 책을 떠나지 않는다', async ({ page }) => {
  await readBook(page, BOOK)

  await openGoToPage(page)
  await page.getByRole('button', { name: 'Cancel' }).focus()
  await page.keyboard.press('Escape')

  await expect(page.getByRole('dialog', { name: 'Go to page' })).toBeHidden()
  await expect(stage(page)).toBeVisible()
  await expect(counter(page)).toBeFocused()
})

test('R-266 · 번호를 적는 동안 화살표는 페이지를 넘기지 않는다', async ({ page }) => {
  await readBook(page, BOOK)

  await openGoToPage(page)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')

  await expect(counter(page)).toHaveText('1 / 12')
})

test('R-2C1 · 슬라이드쇼가 스스로 페이지를 넘긴다', async ({ page }) => {
  await readBook(page, BOOK)

  // 가장 짧은 간격으로 줄여 둔다.
  const panel = page.getByRole('dialog', { name: 'Reading settings' })
  await useSettings(page)
  for (let step = 0; step < 3; step++) {
    await panel.getByRole('button', { name: 'Spend less time on a page' }).click()
  }
  await expect(panel.getByText('2s')).toBeVisible()
  await panel.getByRole('button', { name: 'Close' }).click()

  await use(page, 'slideshow')
  // 돌기 시작하면 툴바가 함께 숨는다. 카운터도 툴바에 있으므로 페이지는 그림으로 센다.
  await expect(page.locator('header')).toHaveCount(0)
  const onStage = page.locator('#reader-stage img')
  await expect(page.getByRole('img', { name: 'Page 2' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('img', { name: 'Page 3' })).toBeVisible({ timeout: 10000 })

  // 멈추는 것은 키가 맡는다.
  await page.keyboard.press('p')
  const stopped = await onStage.first().getAttribute('alt')
  await page.waitForTimeout(3000)
  await expect(onStage.first()).toHaveAttribute('alt', stopped ?? '')
})
