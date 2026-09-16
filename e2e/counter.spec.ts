/** R-217 · 카운터가 지금 걸린 파일 이름까지 말해 준다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, counter, readBook, readMenuItem, use } from './fixture/app.ts'
import type { MenuControl } from './fixture/app.ts'

/**
 * 메뉴 항목 오른쪽 곁글에 적힌 지금 값을 본다. 예전 툴바 버튼에 적혀 있던 글자가
 * 그리로 옮겨 갔다 — 항목 자체의 이름은 상태와 상관없이 그대로다.
 */
const expectHint = (page: Page, which: MenuControl, value: string): Promise<void> =>
  readMenuItem(page, which, async (item) => {
    await expect(item.locator('[aria-hidden="true"] > span')).toHaveText(value)
  })

test('R-217 · 카운터 아래에 아카이브 안의 파일 이름이 보인다', async ({ page }) => {
  await readBook(page)

  await expect(counter(page)).toHaveText('1 / 6')
  await expect(page.getByText('page-01.png', { exact: true })).toBeVisible()

  await control.next(page).click()
  await expect(page.getByText('page-02.png', { exact: true })).toBeVisible()
})

test('R-217 · 두 장이 걸리면 이름도 둘이다', async ({ page }) => {
  await readBook(page)
  await use(page, 'view')
  await expectHint(page, 'view', 'Two')

  await control.next(page).click()
  await expect(counter(page)).toHaveText('2–3 / 6')
  await expect(page.getByText('page-02.png · page-03.png', { exact: true })).toBeVisible()
})
