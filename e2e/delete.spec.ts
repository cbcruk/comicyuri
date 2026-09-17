/** S-131 · 책을 지우기 전에 묻는다. 지운 것은 새로고침을 넘겨 돌아오지 않는다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { counter, importBook, importBooks, openReader, openShelf, use } from './fixture/app.ts'

const bin = (page: Page, title: string) =>
  page.getByRole('button', { name: `Remove ${title} from shelf…` })

/** 지울지 묻는 대화상자. 제목이 곧 물음이다. */
const question = (page: Page, title: string) =>
  page.getByRole('alertdialog', { name: `Remove ${title}?` })

const confirm = (page: Page, title: string) =>
  question(page, title).getByRole('button', { name: 'Remove', exact: true })

test('S-131 · 🗑은 묻기만 하고, 지키기를 고르면 책이 남는다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)

  await bin(page, title).click()
  await expect(question(page, title)).toBeVisible()
  // 아직 아무것도 지워지지 않았다. 대화상자 뒤는 닿지 않으므로 역할이 아니라 제목으로 찾는다.
  await expect(page.getByTitle(title)).toBeVisible()

  await question(page, title).getByRole('button', { name: 'Keep' }).click()
  await expect(question(page, title)).toHaveCount(0)
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  // 지키기로 한 책은 읽던 자리도 그대로다.
  await openReader(page, title)
  await expect(counter(page)).toHaveText('1 / 6')
})

test('S-131 · 지우기를 고르면 책장에서 사라지고 새로고침을 넘겨 돌아오지 않는다', async ({
  page,
}) => {
  await openShelf(page)
  const title = await importBook(page)

  await bin(page, title).click()
  await confirm(page, title).click()

  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
  await expect(page.getByText('Your shelf is empty')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Your shelf is empty')).toBeVisible()
})

test('S-131 · 묻는 동안에는 그 카드로 들어갈 수 없다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)

  await bin(page, title).click()
  await expect(question(page, title)).toBeVisible()

  // 물음은 모달이다. 카드 한가운데를 눌러도 손에 닿는 것은 링크가 아니다.
  const link = page.locator(`a[aria-label="${title}"]`)
  const box = await link.boundingBox()
  if (box === null) throw new Error('카드가 없다')

  const reachesLink = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('a') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  )

  expect(reachesLink).toBe(false)

  // 키보드로도 닿지 않는다. 초점을 옮기려 해도 링크에 앉지 않는다.
  await link.focus()
  expect(await link.evaluate((element) => element === document.activeElement)).toBe(false)
})

test('S-131 · 묻던 중에 뒤로 가기로 떠났다 돌아오면 물음이 남아 있지 않다', async ({ page }) => {
  await openShelf(page)
  const [first, second] = await importBooks(page, [
    { fileName: 'volume-1.cbz', pageCount: 4 },
    { fileName: 'volume-2.cbz', pageCount: 6 },
  ])

  // 책장 → 리더 → 책장. 뒤로 가기가 앱 안의 리더로 돌아가도록 발자국을 남긴다.
  await openReader(page, second!)
  await use(page, 'shelf')

  // 물음은 모달이라 책장 안에서는 떠날 수 없다. 브라우저의 뒤로 가기는 그것과 상관없이 떠난다.
  await bin(page, first!).click()
  await expect(question(page, first!)).toBeVisible()
  await page.goBack()
  await expect(counter(page)).toBeVisible()

  await use(page, 'shelf')
  await expect(question(page, first!)).toHaveCount(0)
  await expect(page.getByRole('link', { name: first! })).toBeVisible()
})
