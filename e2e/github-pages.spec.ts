/**
 * N-407 · GitHub Pages에서도 주소가 그대로 동작한다. 앱이 루트가 아니라
 * `/comicyuri/` 아래에 놓이고, 없는 경로에는 재작성 대신 `404.html`이 온다.
 *
 * 이 파일만 다른 서버를 본다. `vp build --mode github-pages`로 지은 번들을
 * Pages처럼 행동하는 서버(`fixture/pages-host.ts`)가 내준다.
 */

import { expect, test } from '@playwright/test'

import { control, counter, importBook, openReader, stage, use } from './fixture/app.ts'

const SHELF = '/comicyuri/'

test('N-407 · 저장소 이름 아래에서 책장과 리더가 오간다', async ({ page }) => {
  await page.goto(SHELF)
  const title = await importBook(page)

  await openReader(page, title)
  await expect(page).toHaveURL(/\/comicyuri\/book\/volume-1/)

  await use(page, 'shelf')
  await expect(page).toHaveURL(/\/comicyuri\/$/)
  await expect(page.getByRole('link', { name: title })).toBeVisible()
})

test('N-407 · 리더 주소로 곧장 들어오면 `404.html`이 앱을 띄운다', async ({ page }) => {
  await page.goto(SHELF)
  const title = await importBook(page)
  await openReader(page, title)
  await control.next(page).click()
  await expect(counter(page)).toHaveText('2 / 6')

  // 그 경로에는 파일이 없다. 서버는 404로 답하지만 문서는 앱이다.
  const response = await page.reload()

  expect(response?.status()).toBe(404)
  await expect(page).toHaveURL(/\/comicyuri\/book\/volume-1/)
  await expect(stage(page).getByRole('img')).toBeVisible()
  await expect(counter(page)).toHaveText('2 / 6')
})

test('N-407 · 없는 주소에서 돌아가는 링크도 저장소 이름 아래를 가리킨다', async ({ page }) => {
  await page.goto('/comicyuri/nowhere')

  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
  // 찾다 못 찾은 경로는 주소창에 보이는 그대로다.
  await expect(page.getByText('/comicyuri/nowhere')).toBeVisible()

  await page.getByRole('link', { name: 'Back to the shelf' }).click()

  await expect(page).toHaveURL(/\/comicyuri\/$/)
  await expect(page.getByRole('button', { name: 'Open files' })).toBeVisible()
})

test('N-407 · 끝의 슬래시 없이 와도 책장이다', async ({ page }) => {
  await page.goto('/comicyuri')

  await expect(page).toHaveURL(/\/comicyuri\/$/)
  await expect(page.getByRole('button', { name: 'Open files' })).toBeVisible()
})
