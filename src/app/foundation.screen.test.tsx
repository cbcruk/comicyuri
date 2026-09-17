/**
 * 스타일 기초 점검. 앱의 스타일시트 아래에서 Astryx 컴포넌트가 제 모양을 지키는지 본다.
 *
 * CSS 레이어의 차례가 틀리면 어느 화면에서도 오류 없이 똑같이 깨진다 — 초기화 규칙 하나가
 * 컴포넌트보다 높은 레이어에 앉으면 모든 버튼의 안쪽 여백이 0이 된다. Astryx 이관 안내가
 * 화면을 옮기기 전에 이것부터 세우라고 하는 이유다(`astryx docs migration`의 Foundation
 * Smoke Test). 차례는 `vite.stylex.ts`와 `styles.css`가 정한다.
 */

import { render } from 'vitest-browser-react'
import { expect, test } from 'vite-plus/test'

import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { TextInput } from '@astryxdesign/core/TextInput'

import '../styles.css'
import { Providers } from './providers.tsx'

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

test('Astryx primitives keep their padding, fill and borders under the app stylesheet', async () => {
  const screen = await render(
    <Providers theme="dark">
      <Button label="Primary action" variant="primary" />
      <TextInput label="Email" value="" onChange={() => undefined} />
      <Card>One card with default padding</Card>
    </Providers>,
  )

  const button = getComputedStyle(screen.getByRole('button', { name: 'Primary action' }).element())
  expect(button.paddingInlineStart).not.toBe('0px')
  expect(button.backgroundColor).not.toBe(TRANSPARENT)

  // 입력란의 여백과 테두리는 `<input>`이 아니라 그것을 감싼 상자에 있다.
  const inputBox = screen
    .getByRole('textbox', { name: 'Email' })
    .element()
    .closest('.astryx-text-input')
  expect(inputBox).not.toBeNull()
  const input = getComputedStyle(inputBox ?? document.body)
  expect(input.paddingInlineStart).not.toBe('0px')
  expect(input.borderTopWidth).not.toBe('0px')

  const cardBox = screen
    .getByText('One card with default padding')
    .element()
    .closest('.astryx-card')
  expect(cardBox).not.toBeNull()
  const card = getComputedStyle(cardBox ?? document.body)
  expect(card.paddingInlineStart).not.toBe('0px')
  expect(card.borderTopWidth).not.toBe('0px')
})
