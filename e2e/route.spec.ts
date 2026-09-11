/**
 * N-406 · 책 id가 URL을 왕복한다. 책 id는 파일 이름을 그대로 담으므로 띄어쓰기와
 * 한글이 흔한데, 그것이 경로에 실렸다가 돌아오는 길은 브라우저에서만 드러난다.
 *
 * F-509도 여기 있다. 없는 책을 가리키는 URL은 라우팅과 ManagedResource가 맞물려야
 * 실패에 닿으므로, 그 문구 역시 브라우저에서만 나온다.
 */

import { expect, test } from '@playwright/test'

import { counter, importBook, openReader, openShelf, stage } from './fixture/app.ts'

test('N-406 · 이름에 공백이 있는 책도 열린다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page, { fileName: 'Shuuden Deisui Anken.zip', pageCount: 6 })

  await openReader(page, title)

  await expect(stage(page).getByRole('img')).toBeVisible()
  await expect(counter(page)).toHaveText('1 / 6')
})

test('N-406 · 이름에 공백이 있는 책은 새로고침 뒤에도 그 자리다', async ({ page }) => {
  await openShelf(page)
  const title = await importBook(page, { fileName: '심야 만취 안건.zip', pageCount: 6 })

  await openReader(page, title)
  await page.reload()

  await expect(stage(page).getByRole('img')).toBeVisible()
  await expect(counter(page)).toHaveText('1 / 6')
})

test('F-509 · 지워진 책을 가리키는 링크는 없어졌다고 말한다', async ({ page }) => {
  await openShelf(page)
  await page.goto('/book/gone.zip::1')

  await expect(page.getByText(/no longer on the shelf/)).toBeVisible()
  // 이미지가 없는 것이 아니라 책이 없는 것이므로, 임포트 쪽 문구가 나와서는 안 된다.
  await expect(page.getByText('No images found')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '← Shelf' })).toBeVisible()
})
