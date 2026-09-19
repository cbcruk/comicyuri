/** R-213 · 카운터가 지금 화면에 걸린 스프레드를 센다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { counter, readBook, readMenuItem, use } from './fixture/app.ts'
import type { MenuControl } from './fixture/app.ts'

/**
 * 메뉴 항목 오른쪽 곁글에 적힌 지금 값을 본다. 예전 툴바 버튼에 적혀 있던 글자가
 * 그리로 옮겨 갔다 — 항목 자체의 이름은 상태와 상관없이 그대로다.
 */
const expectHint = (page: Page, which: MenuControl, value: string): Promise<void> =>
  readMenuItem(page, which, async (item) => {
    await expect(item.locator('[aria-hidden="true"] > span')).toHaveText(value)
  })

test('R-213 · 넘기면 카운터가 따라온다', async ({ page }) => {
  await readBook(page)

  await expect(counter(page)).toHaveText('1 / 6')

  await use(page, 'next')
  await expect(counter(page)).toHaveText('2 / 6')
})

test('R-213 · 두 장이 걸리면 카운터도 둘을 센다', async ({ page }) => {
  await readBook(page)
  await use(page, 'view')
  await expectHint(page, 'view', 'Two')

  await use(page, 'next')
  await expect(counter(page)).toHaveText('2–3 / 6')
})
