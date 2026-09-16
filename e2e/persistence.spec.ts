/** P-301~303 · 새로고침을 넘겨 남는 것들. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  control,
  counter,
  importBook,
  openReader,
  openShelf,
  readBook,
  readMenuItem,
  use,
} from './fixture/app.ts'

/**
 * 메뉴 항목 오른쪽 곁글에 적힌 지금 값을 본다.
 *
 * 예전 툴바에서는 버튼이 값을 글자로 이고 있었다. 메뉴에서는 항목의 이름이 하는 일을
 * 말하고 값은 그 오른쪽 곁글에 서므로, 같은 글자를 거기서 읽는다.
 */
const expectValue = (page: Page, item: 'direction' | 'view', value: string): Promise<void> =>
  readMenuItem(page, item, async (found) => {
    await expect(found.locator('[aria-hidden="true"] > span')).toHaveText(value)
  })

test('P-301 · 책은 새로고침을 넘겨 책장에 남는다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)

  await page.reload()

  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await expect(page.getByText('6 pages')).toBeVisible()
})

test('P-302 · 읽던 위치와 북마크가 남는다', async ({ page }) => {
  const title = await readBook(page)

  await control.next(page).click()
  await control.next(page).click()
  await expect(counter(page)).toHaveText('3 / 6')
  await use(page, 'bookmark')

  await page.reload()
  await expect(page.getByRole('img', { name: 'Page 3' })).toBeVisible()
  await expect(counter(page)).toHaveText('3 / 6')
  // 북마크는 메뉴로 접히며 `menuitemcheckbox`가 되었고, 켜졌다는 말을 `aria-checked`로 한다.
  await readMenuItem(page, 'bookmark', async (item) => {
    await expect(item).toHaveAttribute('aria-checked', 'true')
  })

  // 책장을 거쳐 다시 들어와도 같은 자리다.
  await use(page, 'shelf')
  await openReader(page, title)
  await expect(counter(page)).toHaveText('3 / 6')
})

test('P-303 · 설정은 남고 다음 책에도 적용된다', async ({ page }) => {
  await readBook(page)

  await expectValue(page, 'direction', 'RTL')
  await use(page, 'direction')
  await use(page, 'view')
  await expectValue(page, 'direction', 'LTR')
  await expectValue(page, 'view', 'Two')

  await page.reload()
  await expectValue(page, 'direction', 'LTR')
  await expectValue(page, 'view', 'Two')
})

test('P-307 · 책을 들여오면 브라우저에 서재를 지워지지 않게 해 달라고 요청한다', async ({
  page,
}) => {
  // 영구 저장을 허락할지는 브라우저가 방문 이력 같은 신호로 정하므로, 시험 브라우저에서
  // 결과는 그때그때 다르다. 여기서 고정하는 것은 앱이 요청하는지다.
  await page.addInitScript(() => {
    const calls: string[] = []
    Object.assign(window, { persistCalls: calls })
    navigator.storage.persisted = async () => {
      calls.push('persisted')
      return false
    }
    navigator.storage.persist = async () => {
      calls.push('persist')
      return true
    }
  })

  await openShelf(page)
  expect(await page.evaluate(() => Reflect.get(window, 'persistCalls'))).toStrictEqual([])

  await importBook(page)
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'persistCalls')))
    .toStrictEqual(['persisted', 'persist'])
})
