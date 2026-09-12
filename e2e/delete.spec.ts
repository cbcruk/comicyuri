/** S-131 · 책을 지우기 전에 묻는다. 지운 것은 새로고침을 넘겨 돌아오지 않는다. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, counter, importBook, importBooks, openReader, openShelf } from './fixture/app.ts'

const bin = (page: Page, title: string) =>
  page.getByRole('button', { name: `Remove ${title} from shelf…` })

const confirm = (page: Page, title: string) =>
  page.getByRole('button', { name: `Remove ${title} from shelf`, exact: true })

test('S-131 · 🗑은 묻기만 하고, 지키기를 고르면 책이 남는다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)

  await bin(page, title).click()
  await expect(page.getByRole('group', { name: `Remove ${title}?` })).toBeVisible()
  // 아직 아무것도 지워지지 않았다.
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await page.getByRole('button', { name: `Keep ${title}` }).click()
  await expect(page.getByRole('group', { name: `Remove ${title}?` })).toHaveCount(0)
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
  await expect(page.getByRole('group', { name: `Remove ${title}?` })).toBeVisible()

  // 물음이 카드를 덮는다. 카드 한가운데에서 손에 닿는 것은 링크가 아니다.
  const box = await page.getByRole('link', { name: title }).boundingBox()
  if (box === null) throw new Error('카드가 없다')

  const reachesLink = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('a') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  )

  expect(reachesLink).toBe(false)
})

test('S-131 · 다른 책을 열었다 돌아오면 묻던 것이 남아 있지 않다', async ({ page }) => {
  await openShelf(page)
  const [first, second] = await importBooks(page, [
    { fileName: 'volume-1.cbz', pageCount: 4 },
    { fileName: 'volume-2.cbz', pageCount: 6 },
  ])

  await bin(page, first!).click()
  await expect(page.getByRole('group', { name: `Remove ${first}?` })).toBeVisible()

  await openReader(page, second!)
  await control.shelf(page).click()

  await expect(page.getByRole('group', { name: `Remove ${first}?` })).toHaveCount(0)
  await expect(page.getByRole('link', { name: first! })).toBeVisible()
})
