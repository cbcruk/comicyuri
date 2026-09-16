/**
 * R-2B1~2B3 · 툴바에 버튼이 없던 설정들을 패널에서 바꾸고, 그것이 남는지.
 * R-2B6 · 같은 패널을 책장에서도 여는지.
 */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  control,
  counter,
  importBook,
  importBooks,
  openReader,
  openShelf,
  readBook,
  openMenu,
  readMenuItem,
  stage,
  use,
} from './fixture/app.ts'

/**
 * 설정 패널을 여닫는다.
 *
 * `use(page, 'settings')`를 쓰지 못한다. 이 항목은 상태를 지므로
 * `menuitemcheckbox`인데, 픽스처의 `openMenu`는 이름에 `bookmark`·`fullscreen`·
 * `slideshow`가 든 것만 그 역할로 찾기 때문이다. 픽스처가 그것을 알게 되면
 * 이 helper는 `use(page, 'settings')` 한 줄로 줄어든다.
 */
const useSettings = async (page: Page): Promise<void> => {
  await openMenu(page, 'settings')
  await page.getByRole('menuitemcheckbox', { name: 'Reading settings' }).click()
}

const panel = (page: Page) => page.getByRole('dialog', { name: 'Reading settings' })
const coverAlone = (page: Page) => page.getByRole('switch', { name: 'Cover on its own' })

/**
 * 방향 항목이 곁글에 적고 있는 지금 값. 예전에는 툴바 버튼의 글자였고, 지금은
 * 메뉴 항목 오른쪽의 곁글이다 — 항목의 이름은 `Toggle reading direction`으로
 * 고정이라 값은 그 옆에 선다.
 */
const expectDirection = (page: Page, value: string) =>
  readMenuItem(page, 'direction', async (item) => {
    await expect(item.locator('span[aria-hidden="true"] > span')).toHaveText(value)
  })

test('R-2B1 · ⚙ 버튼이 패널을 열고 닫는다', async ({ page }) => {
  await readBook(page)

  await expect(panel(page)).toHaveCount(0)
  await useSettings(page)
  await expect(panel(page)).toBeVisible()

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(panel(page)).toHaveCount(0)
})

test('R-2B1 · 표지를 혼자 두지 않기로 하면 배치가 바로 바뀌고 새로고침을 넘긴다', async ({
  page,
}) => {
  await readBook(page)
  await use(page, 'view')
  await expect(stage(page).getByRole('img')).toHaveCount(1)

  await useSettings(page)
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

  await useSettings(page)
  await page.getByRole('button', { name: 'Stay put' }).click()
  await expect(page.getByRole('button', { name: 'Stay put' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.reload()
  await useSettings(page)
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
  await useSettings(page)
  await remember(page).click()
  await page.getByRole('button', { name: 'Close' }).click()

  // 1권만 서양 코믹스처럼 읽는다.
  await expectDirection(page, 'RTL')
  await use(page, 'direction')
  await expectDirection(page, 'LTR')

  // 2권은 전역 기본값 그대로다.
  await use(page, 'shelf')
  await openReader(page, titles[1]!)
  await expectDirection(page, 'RTL')

  // 1권으로 돌아오면 그 책이 정한 대로다.
  await use(page, 'shelf')
  await openReader(page, titles[0]!)
  await expectDirection(page, 'LTR')
})

test('R-2B3 · 스위치를 끄면 전역 기본값으로 돌아간다', async ({ page }) => {
  await readBook(page)

  await useSettings(page)
  await remember(page).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await use(page, 'direction')
  await expectDirection(page, 'LTR')

  await useSettings(page)
  await remember(page).click()
  await page.getByRole('button', { name: 'Close' }).click()

  // 이 책이 정한 것을 놓는다. 그러지 않으면 그대로 전역 기본값이 되어 버린다.
  await expectDirection(page, 'RTL')

  await page.reload()
  await expectDirection(page, 'RTL')
})

test('R-2B6 · 책장에서 정한 기본값이 그 뒤에 여는 책에 걸린다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)

  // 책을 열지 않고 이어 읽기 방식을 정한다.
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  await page.getByRole('button', { name: 'Close' }).click()

  await openReader(page, title)
  await control.next(page).click()
  await expect(counter(page)).toHaveText('2 / 6')
  await use(page, 'shelf')

  // 처음부터 보기로 했으므로 읽던 자리로 가지 않는다.
  await openReader(page, title)
  await expect(counter(page)).toHaveText('1 / 6')
})

test('R-2B6 · 책장에서 정한 것이 새로고침을 넘기고, 리더의 패널에도 그대로 보인다', async ({
  page,
}) => {
  await openShelf(page)
  const title = await importBook(page)

  await page.getByRole('button', { name: 'Reading settings' }).click()
  await page.getByRole('switch', { name: 'Cover on its own' }).click()
  await page.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await expect(page.getByRole('switch', { name: 'Cover on its own' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.getByRole('button', { name: 'Close' }).click()

  // 같은 값을 리더의 패널이 그대로 보여 준다. 한 자리를 두 곳에서 여는 것이다.
  await openReader(page, title)
  await useSettings(page)
  await expect(page.getByRole('switch', { name: 'Cover on its own' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
})
