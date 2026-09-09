/** R-232~234, R-241, R-243 · 실제 포인터로만 확인되는 것들. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { control, counter, pageBox, readBook, stage, zoomOf } from './fixture/app.ts'

/** 스테이지 세로 한가운데의 y. 탭과 드래그는 모두 이 높이에서 한다. */
const middleY = async (page: Page): Promise<number> => {
  const box = await stage(page).boundingBox()
  if (box === null) throw new Error('스테이지가 없다')
  return box.y + box.height / 2
}

/**
 * 포인터를 눌러 끌고 놓는다.
 *
 * 사이사이 한 프레임씩 쉰다. 리더는 누름을 본 뒤에야 이동과 놓음을 듣기 시작하므로
 * (구독이 제스처가 살아 있는 동안에만 존재한다), 한 틱 안에 몰아치면 리더가 그
 * 움직임을 아예 보지 못한다. 사람 손으로는 일어날 수 없는 속도다.
 */
const drag = async (
  page: Page,
  from: Readonly<{ x: number; y: number }>,
  to: Readonly<{ x: number; y: number }>,
): Promise<void> => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.waitForTimeout(32)
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.waitForTimeout(32)
  await page.mouse.up()
}

/** 손가락 두 개를 CDP로 직접 놓는다. Playwright의 터치는 한 점뿐이라 핀치가 안 된다. */
const pinch = async (
  page: Page,
  centre: Readonly<{ x: number; y: number }>,
  from: number,
  to: number,
): Promise<void> => {
  const session = await page.context().newCDPSession(page)
  const points = (span: number) => [
    { x: centre.x - span / 2, y: centre.y, id: 1 },
    { x: centre.x + span / 2, y: centre.y, id: 2 },
  ]

  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points(from),
  })
  // 누름을 본 뒤에야 이동을 듣기 시작한다. `drag`와 같은 이유로 한 프레임 쉰다.
  await page.waitForTimeout(32)
  // 손가락 두 개가 움직이면 포인터 이벤트는 하나씩 따로 온다. 그 사이 순간에는
  // 두 손가락의 한가운데가 잠깐 한쪽으로 쏠리고, 확대는 그 순간의 한가운데를
  // 중심으로 삼는다. 실제 손처럼 잘게 나누어 움직여야 그 쏠림이 작게 남는다.
  const STEPS = 12
  for (let step = 1; step <= STEPS; step++) {
    const span = from + ((to - from) * step) / STEPS
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(span),
    })
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await session.detach()
}

test('R-241 · 오른쪽에서 왼쪽으로 읽을 때 왼쪽 1/3 탭이 앞으로 넘긴다', async ({ page }) => {
  await readBook(page)
  const viewport = page.viewportSize()
  const y = await middleY(page)

  await page.touchscreen.tap((viewport?.width ?? 0) * 0.1, y)
  await expect(counter(page)).toHaveText('2 / 6')

  await page.touchscreen.tap((viewport?.width ?? 0) * 0.9, y)
  await expect(counter(page)).toHaveText('1 / 6')
})

test('R-243 · 옆으로 끌면 그 반대쪽 페이지를 부른다', async ({ page }) => {
  await readBook(page)
  const viewport = page.viewportSize()
  const centre = (viewport?.width ?? 0) / 2
  const y = await middleY(page)

  // 오른쪽으로 끌면 왼쪽 페이지를 부르고, 이 방향에서 왼쪽은 다음 장이다.
  await drag(page, { x: centre, y }, { x: centre + 80, y })
  await expect(counter(page)).toHaveText('2 / 6')

  await drag(page, { x: centre, y }, { x: centre - 80, y })
  await expect(counter(page)).toHaveText('1 / 6')
})

test('R-244 · 10px 이내로 움직인 누름은 탭으로 친다', async ({ page }) => {
  await readBook(page)
  const viewport = page.viewportSize()
  const y = await middleY(page)
  const x = (viewport?.width ?? 0) * 0.1

  await drag(page, { x, y }, { x: x + 6, y: y + 4 })

  await expect(counter(page)).toHaveText('2 / 6')
})

test('R-234 · Ctrl+휠로 확대하고 축소한다', async ({ page }) => {
  await readBook(page)
  const viewport = page.viewportSize()
  const y = await middleY(page)

  await page.mouse.move((viewport?.width ?? 0) / 2, y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -240)
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(1)

  await page.mouse.wheel(0, 600)
  await page.keyboard.up('Control')
  await expect.poll(() => zoomOf(page)).toBe(1)
})

test('R-232 · 두 손가락을 벌리면 그만큼 확대된다', async ({ page }) => {
  await readBook(page)
  const viewport = page.viewportSize()
  const centre = { x: (viewport?.width ?? 0) / 2, y: await middleY(page) }

  await pinch(page, centre, 100, 200)

  await expect.poll(() => zoomOf(page)).toBeCloseTo(2, 1)
})

test('R-233 · 확대해도 손가락 사이 지점이 제자리에 머문다', async ({ page }) => {
  await readBook(page)
  const viewport = page.viewportSize()
  // 가운데에서 비껴 잡는다. 한가운데를 잡으면 어떤 계산이든 제자리로 보인다.
  const anchor = { x: (viewport?.width ?? 0) * 0.35, y: await middleY(page) }

  const before = await pageBox(page)
  const fraction = {
    x: (anchor.x - before.x) / before.width,
    y: (anchor.y - before.y) / before.height,
  }

  await pinch(page, anchor, 100, 220)
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(1.5)

  // 손가락이 한 번에 하나씩 움직이는 동안 중심이 미세하게 흔들리므로, 몇 픽셀은
  // 남는다. 이 계산이 틀어지면 화면은 손가락에서 수십 픽셀씩 미끄러진다.
  const after = await pageBox(page)
  expect(Math.abs(after.x + fraction.x * after.width - anchor.x)).toBeLessThan(3)
  expect(Math.abs(after.y + fraction.y * after.height - anchor.y)).toBeLessThan(3)
})

test('R-239 · 페이지를 넘기면 줌이 처음으로 돌아온다', async ({ page }) => {
  await readBook(page)
  const viewport = page.viewportSize()
  const centre = { x: (viewport?.width ?? 0) / 2, y: await middleY(page) }

  await pinch(page, centre, 100, 200)
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(1)

  await control.next(page).click()

  await expect(counter(page)).toHaveText('2 / 6')
  await expect.poll(() => zoomOf(page)).toBe(1)
})
