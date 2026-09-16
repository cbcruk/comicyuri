/** R-204 · 책을 떠나면 페이지가 내준 object URL이 하나도 남지 않는다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, readBook, stage, use } from './fixture/app.ts'

/**
 * 페이지 URL을 세기 시작한다. 표지 썸네일은 형식이 붙은 `Blob`이고 아카이브에서 푼
 * 페이지는 형식이 없으므로, 형식 없는 것만 센다.
 */
const countPageUrls = (page: Page) =>
  page.addInitScript(() => {
    const pages = new Set<string>()
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object)
      if (object instanceof Blob && object.type === '') pages.add(url)
      return url
    }
    URL.revokeObjectURL = (url: string) => {
      pages.delete(url)
      revoke(url)
    }
    Object.assign(window, { livePageUrls: pages })
  })

const livePageUrls = (page: Page): Promise<number> =>
  page.evaluate(() => Reflect.get(Reflect.get(window, 'livePageUrls'), 'size'))

test('R-204 · 멀리 건너뛰었다가 책을 떠나도 페이지 URL이 남지 않는다', async ({ page }) => {
  // 미리 읽지 않은 페이지로 갈 때마다 화면에 걸 스프레드와 미리 읽을 이웃이 같은 페이지를
  // 한꺼번에 부른다. 여는 순간과 양 끝으로 건너뛰는 순간이 모두 그렇다.
  await countPageUrls(page)
  const title = await readBook(page, { fileName: 'volume-1.cbz', pageCount: 12 })

  await control.last(page).click()
  await expect(stage(page).getByRole('img', { name: 'Page 12' })).toBeVisible()
  await control.first(page).click()
  await expect(stage(page).getByRole('img', { name: 'Page 1' })).toBeVisible()

  await use(page, 'shelf')
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await expect.poll(() => livePageUrls(page)).toBe(0)
})

test('R-204 · 페이지를 풀고 있는 순간에 책을 떠나도 URL이 남지 않는다', async ({ page }) => {
  // 크고 무거운 페이지라 끝으로 건너뛴 페이지를 푸는 동안 책을 떠날 수 있다. 푸는 일은 책이
  // 닫힌 뒤에 끝나고, 그때 만든 URL은 캐시하지 않고 곧바로 놓아야 한다.
  await countPageUrls(page)
  const title = await readBook(page, {
    fileName: 'volume-heavy.cbz',
    pageCount: 12,
    size: { width: 3200, height: 4800 },
  })

  await control.last(page).click()
  await use(page, 'shelf')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  // 늦게 끝난 풀기가 URL을 만들 틈을 준 뒤에 센다.
  await page.waitForTimeout(1_500)
  expect(await livePageUrls(page)).toBe(0)
})
