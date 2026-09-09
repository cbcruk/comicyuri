/** S-113 · 폴더 열기. 테스트 경로가 없어 브라우저에서만 확인되던 자리다. */

import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { png } from './fixture/archive.ts'
import { control, counter, importBook, openReader, openShelf } from './fixture/app.ts'

/** 이미지 몇 장이 든 폴더를 디스크에 만든다. 폴더 선택창은 실제 경로만 받는다. */
const imageFolder = (name: string, count: number): string => {
  const root = mkdtempSync(join(tmpdir(), 'comicyuri-'))
  const folder = join(root, name)
  mkdirSync(folder)
  for (let page = 0; page < count; page++) {
    writeFileSync(
      join(folder, `page-${String(page + 1).padStart(2, '0')}.png`),
      png(120, 180, [40 + page * 37, 90, 160]),
    )
  }
  return folder
}

test('S-113 · 폴더를 고르면 폴더 이름의 책 한 권이 된다', async ({ page }) => {
  const folder = imageFolder('collected-pages', 4)

  await openShelf(page)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await (await chooser).setFiles(folder)

  await expect(page.getByRole('link', { name: 'collected-pages' })).toBeVisible()
  await expect(page.getByText('4 pages')).toBeVisible()

  // 낱장 이미지들이 한 권으로 묶였는지는 리더에서 드러난다.
  await openReader(page, 'collected-pages')
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible()
  await expect(page.locator('header span').first()).toHaveText('1 / 4')
})

test('S-112 · "Open files"가 여러 개를 고를 수 있는 선택창을 연다', async ({ page }) => {
  await openShelf(page)

  const opened = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open files' }).click()
  const chooser = await opened

  expect(chooser.isMultiple()).toBe(true)
  await chooser.setFiles([])
  // 취소와 마찬가지로, 아무것도 고르지 않으면 아무 일도 없다 (S-118).
  await expect(page.getByText('Your shelf is empty')).toBeVisible()
})

test('S-115 · 같은 파일을 다시 열면 같은 책이고, 읽던 자리도 그대로다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page)
  await openReader(page, title)
  await control.next(page).click()
  await expect(counter(page)).toHaveText('2 / 6')
  await control.shelf(page).click()

  await importBook(page)

  await expect(page.getByRole('link', { name: title })).toHaveCount(1)
  await openReader(page, title)
  await expect(counter(page)).toHaveText('2 / 6')
})
