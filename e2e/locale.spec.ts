/** S-151 · 화면 문구의 언어. 브라우저가 말하는 것을 따르고, 설정에서 고를 수도 있다. */

import { expect, test } from '@playwright/test'

import { readBook, use } from './fixture/app.ts'

test.describe('한국어로 말하는 브라우저', () => {
  test.use({ locale: 'ko-KR' })

  test('S-151 · 실패도 한국어로 말한다', async ({ page }) => {
    await page.goto('/')
    await page.goto('/book/gone.zip::1')

    await expect(page.getByText('그 책은 책장에 없습니다 ("gone.zip::1")')).toBeVisible()
    await expect(page.getByRole('button', { name: '← 책장' })).toBeVisible()
  })

  test('S-151 · 책장이 한국어로 선다', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('button', { name: '파일 열기' })).toBeVisible()
    await expect(page.getByRole('button', { name: '폴더 열기' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko-KR')
  })
})

/**
 * 영어로 말하는 브라우저에서 한국어를 골라 본다. 픽스처의 도우미는 영어 이름으로 찾으므로,
 * 책을 열기까지는 영어로 두고 그 뒤에 언어를 바꾼다.
 */
test('S-151 · 설정에서 고른 언어가 화면에 걸리고 새로고침을 넘긴다', async ({ page }) => {
  await readBook(page)
  await use(page, 'settings')

  await page
    .getByRole('dialog', { name: 'Reading settings' })
    .getByRole('radio', { name: '한국어' })
    .click()

  // 패널의 이름도 함께 한국어가 된다.
  const panel = page.getByRole('dialog', { name: '읽기 설정' })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '닫기' }).click()

  const names = await page
    .locator('[role="menubar"] > [role="menuitem"]')
    .evaluateAll((items) => items.map((item) => item.textContent))
  expect(names).toEqual(['책', '보기', '이동', '재생', '설정'])
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko-KR')

  await page.reload()
  await expect(page.getByRole('menuitem', { name: '보기', exact: true })).toBeVisible()
})
