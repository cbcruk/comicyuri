/**
 * 설정 패널 화면 테스트. 실제 Chromium에서 패널을 세우고 눌러 본다.
 *
 * Foldkit의 reader/scene 테스트가 하던 일을 이것이 이어받는다. 보는 것은 두
 * 가지다. 툴바에 버튼이 없던 설정들이 저마다 같은 이름으로 서 있는 것(`R-2B1`,
 * `R-2B6`)과, 누른 것이 부르는 쪽에 그대로 전해지고 고른 결과가 `aria-checked`·
 * `aria-pressed`·`aria-disabled`로 드러나는 것이다 — e2e가 그 이름과 속성으로
 * 패널을 몬다.
 */

import { useState } from 'react'
import { render } from 'vitest-browser-react'
import { expect, test, vi } from 'vite-plus/test'

// 스위치의 트랙과 손잡이는 스타일이 서야 크기를 가진다. 앱이 쓰는 것을 그대로 들여온다.
import '../../styles.css'
import { nudgedSlideSeconds, nudgedThreshold } from '../../settings.ts'
import { defaultSettings } from '../../types.ts'
import type { Settings } from '../../types.ts'
import { Providers } from '../providers.tsx'
import { SettingsPanel } from './settings.tsx'

/** 패널이 부르는 콜백을 모두 스파이로 세운 묶음. */
const spies = () => ({
  onClose: vi.fn(),
  onToggleCoverAlone: vi.fn(),
  onToggleSplitWide: vi.fn(),
  onToggleEnlargeToFit: vi.fn(),
  onToggleRememberBookSettings: vi.fn(),
  onNudgeThreshold: vi.fn(),
  onNudgeSlideSeconds: vi.fn(),
  onSelectAtBookEnd: vi.fn(),
  onSelectResume: vi.fn(),
})

/**
 * 패널을 실제 앱처럼 세운 껍데기. 콜백이 스파이를 부르고 설정도 함께 옮긴다.
 *
 * 패널이 값을 들고 있지 않으므로, 누른 것이 화면에 드러나는지 보려면 값을 쥐는
 * 쪽이 있어야 한다. 부르는 쪽(리더·책장)의 `update`가 하는 일과 같은 것을 여기서는
 * 상태 하나로 한다. 숫자를 끊는 것은 `src/settings.ts`의 것을 그대로 쓴다.
 */
const StatefulPanel = ({
  initial,
  handlers,
}: Readonly<{ initial: Settings; handlers: ReturnType<typeof spies> }>) => {
  const [settings, setSettings] = useState(initial)
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }))

  return (
    <SettingsPanel
      isOpen
      settings={settings}
      onClose={handlers.onClose}
      onToggleCoverAlone={(isChecked) => {
        handlers.onToggleCoverAlone(isChecked)
        change('coverAlone', isChecked)
      }}
      onToggleSplitWide={(isChecked) => {
        handlers.onToggleSplitWide(isChecked)
        change('splitWide', isChecked)
      }}
      onToggleEnlargeToFit={(isChecked) => {
        handlers.onToggleEnlargeToFit(isChecked)
        change('enlargeToFit', isChecked)
      }}
      onToggleRememberBookSettings={(isChecked) => {
        handlers.onToggleRememberBookSettings(isChecked)
        change('rememberBookSettings', isChecked)
      }}
      onNudgeThreshold={(by) => {
        handlers.onNudgeThreshold(by)
        setSettings((current) => ({
          ...current,
          singleThreshold: nudgedThreshold(current.singleThreshold, by),
        }))
      }}
      onNudgeSlideSeconds={(by) => {
        handlers.onNudgeSlideSeconds(by)
        setSettings((current) => ({
          ...current,
          slideSeconds: nudgedSlideSeconds(current.slideSeconds, by),
        }))
      }}
      onSelectAtBookEnd={(atBookEnd) => {
        handlers.onSelectAtBookEnd(atBookEnd)
        change('atBookEnd', atBookEnd)
      }}
      onSelectResume={(resume) => {
        handlers.onSelectResume(resume)
        change('resume', resume)
      }}
    />
  )
}

const renderPanel = async (settings: Partial<Settings> = {}) => {
  const handlers = spies()
  const screen = await render(
    <Providers theme="dark">
      <StatefulPanel initial={{ ...defaultSettings, ...settings }} handlers={handlers} />
    </Providers>,
  )

  return { handlers, screen }
}

test('the settings that have no toolbar button live here', async () => {
  const { screen } = await renderPanel()

  await expect.element(screen.getByRole('dialog', { name: 'Reading settings' })).toBeVisible()

  for (const name of [
    'Cover on its own',
    'Read wide pages in halves',
    'Stretch small pages to fit',
    'Remember these for each book',
  ]) {
    await expect.element(screen.getByRole('switch', { name })).toBeVisible()
  }

  for (const name of [
    'Pair more pages',
    'Pair fewer pages',
    'Spend less time on a page',
    'Spend more time on a page',
    'Next book',
    'Back to start',
    'Stay put',
    'Go there',
    'Ask',
    'Start over',
    'Close',
  ]) {
    await expect.element(screen.getByRole('button', { name, exact: true })).toBeVisible()
  }

  // 기본값이 그대로 보인다. 문턱은 두 자리, 슬라이드쇼는 초다.
  await expect.element(screen.getByText('0.74')).toBeVisible()
  await expect.element(screen.getByText('5s')).toBeVisible()
})

test('turning the cover rule off reports the new settings', async () => {
  const { handlers, screen } = await renderPanel()
  const coverAlone = screen.getByRole('switch', { name: 'Cover on its own' })

  await expect.element(coverAlone).toHaveAttribute('aria-checked', 'true')

  await coverAlone.click()

  expect(handlers.onToggleCoverAlone).toHaveBeenCalledWith(false)
  await expect.element(coverAlone).toHaveAttribute('aria-checked', 'false')
})

test('turning on reading wide pages in halves reports it too', async () => {
  const { handlers, screen } = await renderPanel()
  const splitWide = screen.getByRole('switch', { name: 'Read wide pages in halves' })

  await expect.element(splitWide).toHaveAttribute('aria-checked', 'false')

  await splitWide.click()

  expect(handlers.onToggleSplitWide).toHaveBeenCalledWith(true)
  await expect.element(splitWide).toHaveAttribute('aria-checked', 'true')
})

test('nudging the threshold moves it one step, not to a long decimal', async () => {
  const { handlers, screen } = await renderPanel()

  await screen.getByRole('button', { name: 'Pair fewer pages' }).click()

  expect(handlers.onNudgeThreshold).toHaveBeenCalledWith(0.02)
  await expect.element(screen.getByText('0.76')).toBeVisible()
})

test('the threshold stops at the ends of its range', async () => {
  const { screen } = await renderPanel({ singleThreshold: 0.5 })

  await expect
    .element(screen.getByRole('button', { name: 'Pair more pages' }))
    .toHaveAttribute('aria-disabled', 'true')
  await expect
    .element(screen.getByRole('button', { name: 'Pair fewer pages' }))
    .toHaveAttribute('aria-disabled', 'false')
})

test('the slideshow delay stops at the ends too', async () => {
  const { screen } = await renderPanel({ slideSeconds: 30 })

  await expect
    .element(screen.getByRole('button', { name: 'Spend more time on a page' }))
    .toHaveAttribute('aria-disabled', 'true')

  await screen.getByRole('button', { name: 'Spend less time on a page' }).click()

  await expect.element(screen.getByText('29s')).toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Spend more time on a page' }))
    .toHaveAttribute('aria-disabled', 'false')
})

test('picking what happens at the end of a book reports it', async () => {
  const { handlers, screen } = await renderPanel()
  const stayPut = screen.getByRole('button', { name: 'Stay put', exact: true })

  await expect
    .element(screen.getByRole('button', { name: 'Next book', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')

  await stayPut.click()

  expect(handlers.onSelectAtBookEnd).toHaveBeenCalledWith('stop')
  await expect.element(stayPut).toHaveAttribute('aria-pressed', 'true')
  await expect
    .element(screen.getByRole('button', { name: 'Next book', exact: true }))
    .toHaveAttribute('aria-pressed', 'false')
})

test('choosing how a part-read book opens reports it', async () => {
  const { handlers, screen } = await renderPanel()
  const startOver = screen.getByRole('button', { name: 'Start over', exact: true })

  await expect
    .element(screen.getByRole('button', { name: 'Go there', exact: true }))
    .toHaveAttribute('aria-pressed', 'true')

  await startOver.click()

  expect(handlers.onSelectResume).toHaveBeenCalledWith('restart')
  await expect.element(startOver).toHaveAttribute('aria-pressed', 'true')
})

test('the close button hands the panel back to whoever opened it', async () => {
  const { handlers, screen } = await renderPanel()

  await screen.getByRole('button', { name: 'Close' }).click()

  expect(handlers.onClose).toHaveBeenCalled()
})
