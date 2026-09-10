/** R-2B1~2B3 · 툴바에 버튼이 없던 설정들을 패널에서 바꾸고, 그것이 남는지. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, importBooks, openReader, openShelf, readBook, stage } from './fixture/app.ts'

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

const remember = (page: Page) => page.getByRole('switch', { name: 'Remember these for each book' })

test('R-2B3 · 책마다 기억하기를 켜면 방향이 그 책에만 남는다', async ({ page }) => {
  await openShelf(page)
  const titles = await importBooks(page, [
    { fileName: 'volume-1.cbz', pageCount: 4 },
    { fileName: 'volume-2.cbz', pageCount: 4 },
  ])

  await openReader(page, titles[0]!)
  await control.settings(page).click()
  await remember(page).click()
  await page.getByRole('button', { name: 'Close' }).click()

  // 1권만 서양 코믹스처럼 읽는다.
  await expect(control.direction(page)).toHaveText('RTL')
  await control.direction(page).click()
  await expect(control.direction(page)).toHaveText('LTR')

  // 2권은 전역 기본값 그대로다.
  await control.shelf(page).click()
  await openReader(page, titles[1]!)
  await expect(control.direction(page)).toHaveText('RTL')

  // 1권으로 돌아오면 그 책이 정한 대로다.
  await control.shelf(page).click()
  await openReader(page, titles[0]!)
  await expect(control.direction(page)).toHaveText('LTR')
})

test('R-2B3 · 스위치를 끄면 전역 기본값으로 돌아간다', async ({ page }) => {
  await readBook(page)

  await control.settings(page).click()
  await remember(page).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await control.direction(page).click()
  await expect(control.direction(page)).toHaveText('LTR')

  await control.settings(page).click()
  await remember(page).click()
  await page.getByRole('button', { name: 'Close' }).click()

  // 이 책이 정한 것을 놓는다. 그러지 않으면 그대로 전역 기본값이 되어 버린다.
  await expect(control.direction(page)).toHaveText('RTL')

  await page.reload()
  await expect(control.direction(page)).toHaveText('RTL')
})
