/**
 * 화면 테스트가 실제 브라우저에서 도는지 확인하는 첫 조각.
 *
 * 책장이 저장소를 읽기 전에 무엇을 말하는지 본다. 여기가 서면 Foldkit scene 테스트를
 * 옮겨 올 자리가 생긴다.
 */

import { render } from 'vitest-browser-react'
import { expect, test } from 'vite-plus/test'

import { ShelfScreen } from './shelf.tsx'

test('the shelf says it is loading before the store answers', async () => {
  const screen = await render(<ShelfScreen />)

  await expect.element(screen.getByText('Loading the shelf…')).toBeVisible()
})
