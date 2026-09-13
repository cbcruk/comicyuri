/**
 * N-401~405 · 주소와 이동. 뒤로 가기와 새로고침, 그리고 링크가 페이지를 다시
 * 읽지 않는다는 것은 모두 브라우저에서만 드러난다.
 */

import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, counter, importBook, openReader, openShelf, stage } from './fixture/app.ts'

/**
 * 이 문서에 표를 하나 꽂아 둔다. 페이지를 다시 읽으면 새 문서가 오므로 표가
 * 사라진다. 살아 있으면 같은 문서에서 자리만 옮긴 것이다.
 */
const markDocument = (page: Page): Promise<void> =>
  page.evaluate(() => {
    Object.assign(window, { __sameDocument: true })
  })

const markSurvives = (page: Page): Promise<boolean> =>
  page.evaluate(() => Reflect.get(window, '__sameDocument') === true)

test('N-401 · 책장은 `/`, 리더는 `/book/<id>`', async ({ page }) => {
  await openShelf(page)
  await expect(page).toHaveURL(/\/$/)
  await expect(page).toHaveTitle('comicyuri')

  const title = await importBook(page)
  await openReader(page, title)

  await expect(page).toHaveURL(/\/book\/volume-1/)
  await expect(page).toHaveTitle(/^comicyuri — volume-1/)
})

test('N-402 · 뒤로 가기가 책에서 나오고, 앞으로 가기가 도로 들어간다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)
  await openReader(page, title)

  await page.goBack()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  // 리더는 화면에서 내려간다.
  await expect(stage(page)).toHaveCount(0)

  await page.goForward()

  await expect(page).toHaveURL(/\/book\/volume-1/)
  await expect(stage(page).getByRole('img')).toBeVisible()
})

test('N-403 · 새로고침해도 읽던 책으로 돌아온다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)
  await openReader(page, title)
  await control.next(page).click()
  await expect(counter(page)).toHaveText('2 / 6')

  await page.reload()

  await expect(page).toHaveURL(/\/book\/volume-1/)
  await expect(counter(page)).toHaveText('2 / 6')
})

test('N-404 · 링크 클릭은 페이지를 다시 읽지 않는다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)

  await markDocument(page)
  await openReader(page, title)
  expect(await markSurvives(page)).toBe(true)

  // 돌아오는 길도 같은 문서다.
  await control.shelf(page).click()
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  expect(await markSurvives(page)).toBe(true)

  // 새로고침은 새 문서다. 표가 사라지는 것이 그 증거다.
  await page.reload()
  expect(await markSurvives(page)).toBe(false)
})

/**
 * N-406 · 배포된 곳에서도 `/book/<id>`로 곧장 들어올 수 있어야 한다.
 *
 * 그 경로에는 파일이 없으므로 호스트가 무엇을 내줄지 알아야 한다. 미리보기
 * 서버는 그것을 스스로 해 주지만 배포처는 아니라서, 저장소가 설정을 지고 나간다.
 * 여기서 보는 것은 그 설정이 빌드 결과에 실려 있는지다 — 이 하네스가 방금 그
 * 빌드를 만들었다.
 */
test('N-406 · 빌드 결과가 SPA 폴백 설정을 지고 나간다', async () => {
  const redirects = readFileSync('dist/_redirects', 'utf8')

  // 무엇이 오든 `index.html`이고, 리다이렉트가 아니라 그 자리에서 내준다.
  expect(redirects).toMatch(/^\/\*\s+\/index\.html\s+200$/m)

  // 폴백으로 내준 문서가 중첩 경로에서도 제 자산을 찾으려면 절대 경로여야 한다.
  const html = readFileSync('dist/index.html', 'utf8')
  const assets = Array.from(html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g))

  expect(assets.length).toBeGreaterThan(0)
  for (const [, path] of assets) {
    expect(path).toMatch(/^\//)
  }
})

test('N-405 · 없는 주소는 안내와 함께 돌아갈 길을 준다', async ({ page }) => {
  await openShelf(page)
  await page.goto('/nowhere/at/all')

  await expect(page).toHaveTitle('comicyuri — not found')
  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
  // 무엇을 찾다 못 찾았는지 그대로 보여 준다.
  await expect(page.getByText('/nowhere/at/all')).toBeVisible()

  await page.getByRole('link', { name: 'Back to the shelf' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Open files' })).toBeVisible()
})
