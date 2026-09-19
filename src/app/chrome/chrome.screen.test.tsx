/**
 * 크롬 화면 테스트. 실제 Chromium에서 메뉴바를 세우고 눌러 본다.
 *
 * 보는 것은 셋이다. 예전 툴바가 가지고 있던 접근 가능한 이름이 하나도 빠지지
 * 않고 그대로 있고 저마다 자기 콜백을 부르는 것, 메뉴바가 네이티브 메뉴바처럼
 * 움직이는 것 — 좌우 화살표로 메뉴 사이를 오가고, Enter로 열리고, Escape로
 * 닫힌다 — 그리고 읽는 방향이 서브메뉴 안에서 뒤집기가 아니라 고르기인 것이다.
 */

import { useState } from 'react'
import { userEvent } from 'vite-plus/test/context'
import { render } from 'vitest-browser-react'
import { expect, test, vi } from 'vite-plus/test'

// 슬라이더의 트랙과 손잡이는 스타일이 서야 크기를 가진다. 스타일 없이는 보이는지
// 물어볼 수가 없으므로 앱이 쓰는 것을 그대로 들여온다.
import '../../styles.css'
import { Providers } from '../providers.tsx'
import { ReaderChrome } from './chrome.tsx'
import type { ChromeActions, ChromeState } from './types.ts'

const BASE: ChromeState = {
  counter: '3 / 6',
  page: 2,
  pageCount: 6,
  direction: 'rtl',
  view: 'spread',
  fit: 'contain',
  isBookmarked: false,
  isFullscreen: false,
  isPlaying: false,
  isChromeVisible: true,
}

/** 모든 콜백을 스파이로 세운 묶음. 어느 것이 불렸는지로 버튼을 확인한다. */
const spies = (): ChromeActions => ({
  onExit: vi.fn(),
  onToggleBookmark: vi.fn(),
  onToggleThumbs: vi.fn(),
  onToggleSettings: vi.fn(),
  onToggleFullscreen: vi.fn(),
  onToggleChrome: vi.fn(),
  onChooseDirection: vi.fn(),
  onToggleView: vi.fn(),
  onChooseFit: vi.fn(),
  onToggleBinding: vi.fn(),
  onToggleSlideshow: vi.fn(),
  onRotate: vi.fn(),
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onFirst: vi.fn(),
  onPrevious: vi.fn(),
  onNext: vi.fn(),
  onLast: vi.fn(),
  onStepBookmark: vi.fn(),
  onSlide: vi.fn(),
  onGoToPage: vi.fn(),
})

/** 세워 놓은 화면. 로케이터를 넘겨받는 도우미들이 쓴다. */
type Rendered = Awaited<ReturnType<typeof render>>

const renderChrome = async (state: Partial<ChromeState> = {}) => {
  const actions = spies()
  const screen = await render(
    <Providers>
      <ReaderChrome state={{ ...BASE, ...state }} actions={actions} />
    </Providers>,
  )
  return { actions, screen }
}

/** 메뉴바에 선 트리거 하나. 포커스를 손으로 옮겨야 하는 시험이 이것으로 집는다. */
const trigger = (container: HTMLElement, label: string): HTMLElement => {
  const found = [
    ...container.querySelectorAll<HTMLElement>('[role="menubar"] > [role="menuitem"]'),
  ].find((element) => element.textContent === label)
  if (found === undefined) throw new Error(`메뉴 ${label}이 없다`)
  return found
}

/**
 * 슬라이더의 트랙과 그 위를 덮는 채움. `R-264`는 이 둘의 색과 자리로 확인한다.
 *
 * 트랙은 Astryx가 테마용으로 다는 고정 클래스로 찾는다. 채움에는 그런 이름이 없어서 트랙
 * 바로 뒤에 서는 것을 집는다.
 */
const trackAndFill = (container: HTMLElement): readonly [HTMLElement, HTMLElement] => {
  const track = container.querySelector('.astryx-slider-track')
  const fill = track?.nextElementSibling
  if (!(track instanceof HTMLElement) || !(fill instanceof HTMLElement)) {
    throw new Error('슬라이더가 없다')
  }
  return [track, fill]
}

/**
 * 토큰이 그 자리에서 실제로 풀리는 색.
 *
 * 클래스 이름은 StyleX가 해시로 지으므로 무엇으로 칠했는지는 계산된 색으로만 잴 수 있다.
 * 견줄 색도 같은 테마 안의 같은 자리에서 칠해 읽는다 — 토큰의 값은 테마와 모드에 따라 달라서
 * 숫자로 박아 둘 수 없다.
 */
const tokenColour = (near: HTMLElement, token: string): string => {
  const probe = document.createElement('span')
  probe.style.backgroundColor = `var(${token})`
  near.append(probe)
  const colour = getComputedStyle(probe).backgroundColor
  probe.remove()
  return colour
}

const backgroundOf = (element: HTMLElement): string => getComputedStyle(element).backgroundColor

/**
 * 슬라이더가 옮긴 자리를 그대로 되먹이는 크롬. 끄는 시험만 이것으로 세운다 —
 * 무르는 것을 재려면 값이 손을 따라 움직여야 한다.
 */
const DraggableChrome = ({ actions }: Readonly<{ actions: ChromeActions }>) => {
  const [page, setPage] = useState(BASE.page)

  return (
    <ReaderChrome
      state={{ ...BASE, direction: 'ltr', page }}
      actions={{
        ...actions,
        onSlide: (next) => {
          setPage(next)
          actions.onSlide(next)
        },
      }}
    />
  )
}

/** 끌 수 있는 슬라이더를 세운다. 트랙과, 포인터를 받는 면을 함께 돌려준다. */
const renderDraggable = async () => {
  const actions = spies()
  const screen = await render(
    <Providers>
      <DraggableChrome actions={actions} />
    </Providers>,
  )
  const [track] = trackAndFill(screen.container)
  const surface = track.parentElement
  if (surface === null) throw new Error('슬라이더를 감싼 면이 없다')
  return { actions, screen, track, surface }
}

/**
 * 끌기 한 동작을 흉내 내는 포인터 이벤트. 마우스 포인터는 `1`번이라 진짜 포인터를
 * 잡는 `setPointerCapture`가 그대로 받는다.
 */
const pointerAt = (type: string, clientX: number): PointerEvent =>
  new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, clientX })

/** 지금 열려 있는 메뉴. 닫힌 메뉴도 DOM에 남아 있으므로 보이는 것을 고른다. */
const openMenuElement = (container: HTMLElement): Element | undefined =>
  [...container.querySelectorAll('[role="menu"]')].find((menu) => menu.checkVisibility())

/** 카운터를 눌러 번호 창을 열고, 그 안의 입력란을 돌려준다. */
const openGoToPage = async (screen: Rendered) => {
  await screen.getByRole('button', { name: '3 / 6' }).click()
  const box = screen.getByRole('spinbutton', { name: /^Page/ })
  await expect.element(box).toHaveFocus()
  return box
}

/** 보기 메뉴를 열고 서브메뉴 하나의 flyout까지 펼친다. `first`는 그 안의 첫 라디오다. */
const openViewSubMenu = async (screen: Rendered, subMenu: string, first: string) => {
  await screen.getByRole('menuitem', { name: 'View', exact: true }).click()
  await screen.getByRole('menuitem', { name: subMenu }).click()
  await expect.element(screen.getByRole('menuitemradio', { name: first })).toBeVisible()
}

/** 보기 메뉴의 "Read from" 서브메뉴를 펼친다. */
const openReadFrom = (screen: Rendered) => openViewSubMenu(screen, 'Read from', 'Right to left')

/** 보기 메뉴의 "Fit to" 서브메뉴를 펼친다. */
const openFitTo = (screen: Rendered) => openViewSubMenu(screen, 'Fit to', 'Page')

/** 메뉴 하나를 열고 그 안의 항목을 부른다. */
const chooseFromMenu = async (screen: Rendered, menu: string, item: string) => {
  await screen.getByRole('menuitem', { name: menu, exact: true }).click()
  await screen.getByRole('menuitem', { name: item, exact: true }).click()
}

test('the book menu carries the shelf, the bookmark and the page grid', async () => {
  const { actions, screen } = await renderChrome()

  await chooseFromMenu(screen, 'Book', '← Shelf')
  expect(actions.onExit).toHaveBeenCalled()

  await chooseFromMenu(screen, 'Book', 'Bookmark this page')
  expect(actions.onToggleBookmark).toHaveBeenCalled()

  await chooseFromMenu(screen, 'Book', 'Show every page')
  expect(actions.onToggleThumbs).toHaveBeenCalled()
})

test('a bookmarked page offers to take the bookmark away instead', async () => {
  const { actions, screen } = await renderChrome({ isBookmarked: true })

  await chooseFromMenu(screen, 'Book', 'Remove bookmark from this page')
  expect(actions.onToggleBookmark).toHaveBeenCalled()
})

test('the view menu carries every control that changes how a page is shown', async () => {
  const { actions, screen } = await renderChrome()

  await chooseFromMenu(screen, 'View', 'Toggle one or two pages')
  expect(actions.onToggleView).toHaveBeenCalled()

  await chooseFromMenu(screen, 'View', 'Turn the page a quarter clockwise')
  expect(actions.onRotate).toHaveBeenCalled()

  await chooseFromMenu(screen, 'View', 'Flip how this spread is paired')
  expect(actions.onToggleBinding).toHaveBeenCalled()

  await chooseFromMenu(screen, 'View', 'Zoom in')
  expect(actions.onZoomIn).toHaveBeenCalled()

  await chooseFromMenu(screen, 'View', 'Zoom out')
  expect(actions.onZoomOut).toHaveBeenCalled()

  await chooseFromMenu(screen, 'View', 'Enter fullscreen')
  expect(actions.onToggleFullscreen).toHaveBeenCalled()

  await chooseFromMenu(screen, 'View', 'Hide the toolbar')
  expect(actions.onToggleChrome).toHaveBeenCalled()
})

test('a single-page view has no binding to flip', async () => {
  const { screen } = await renderChrome({ view: 'single' })

  await screen.getByRole('menuitem', { name: 'View', exact: true }).click()

  await expect.element(screen.getByRole('menuitem', { name: 'Zoom in' })).toBeVisible()
  expect(
    screen.getByRole('menuitem', { name: 'Flip how this spread is paired' }).elements(),
  ).toHaveLength(0)
})

test('fullscreen and the slideshow say how to leave once they are on', async () => {
  const { actions, screen } = await renderChrome({ isFullscreen: true, isPlaying: true })

  await chooseFromMenu(screen, 'View', 'Leave fullscreen')
  expect(actions.onToggleFullscreen).toHaveBeenCalled()

  await chooseFromMenu(screen, 'Play', 'Stop the slideshow')
  expect(actions.onToggleSlideshow).toHaveBeenCalled()
})

test('the play menu starts the slideshow and the settings menu opens the panel', async () => {
  const { actions, screen } = await renderChrome()

  await chooseFromMenu(screen, 'Play', 'Start the slideshow')
  expect(actions.onToggleSlideshow).toHaveBeenCalled()

  await chooseFromMenu(screen, 'Settings', 'Reading settings')
  expect(actions.onToggleSettings).toHaveBeenCalled()
})

test('the go menu steps through bookmarks and sends focus to the page box', async () => {
  const { actions, screen } = await renderChrome()

  await chooseFromMenu(screen, 'Go', 'Next bookmark')
  expect(actions.onStepBookmark).toHaveBeenCalledWith(1)

  await chooseFromMenu(screen, 'Go', 'Previous bookmark')
  expect(actions.onStepBookmark).toHaveBeenCalledWith(-1)

  await chooseFromMenu(screen, 'Go', 'Go to page')
  await expect.element(screen.getByRole('spinbutton', { name: /^Page/ })).toHaveFocus()
})

test('the go menu turns the page, and the footer only slides', async () => {
  const { actions, screen } = await renderChrome()

  await chooseFromMenu(screen, 'Go', 'First')
  expect(actions.onFirst).toHaveBeenCalled()

  await chooseFromMenu(screen, 'Go', 'Previous')
  expect(actions.onPrevious).toHaveBeenCalled()

  await chooseFromMenu(screen, 'Go', 'Next')
  expect(actions.onNext).toHaveBeenCalled()

  await chooseFromMenu(screen, 'Go', 'Last')
  expect(actions.onLast).toHaveBeenCalled()

  await expect.element(screen.getByRole('slider', { name: 'Page' })).toBeVisible()
  const footer = screen.container.querySelector('footer')
  const names = [...(footer?.querySelectorAll('button') ?? [])].map((button) => button.textContent)
  expect(names).not.toContain('Next')
  expect(names).not.toContain('Previous')
  expect(names).not.toContain('First')
  expect(names).not.toContain('Last')
})

test('choosing a command lets go of the menubar, so the reader keys work again', async () => {
  const { screen } = await renderChrome()

  await chooseFromMenu(screen, 'Go', 'Next')

  await expect.poll(() => document.activeElement?.closest('[role="menubar"]') ?? null).toBeNull()
})

test('opening a submenu is not a command, so the menubar keeps its focus', async () => {
  const { screen } = await renderChrome()

  await screen.getByRole('menuitem', { name: 'View', exact: true }).click()
  await screen.getByRole('menuitem', { name: 'Read from' }).click()

  await expect.element(screen.getByRole('menuitemradio', { name: 'Right to left' })).toBeVisible()
})

test('the page box waits behind the counter until it is pressed', async () => {
  const { screen } = await renderChrome()

  expect(screen.getByRole('spinbutton', { name: /^Page/ }).query()).toBeNull()
  await expect
    .element(screen.getByRole('button', { name: '3 / 6' }))
    .toHaveAttribute('aria-haspopup', 'dialog')

  await openGoToPage(screen)
})

test('a number in the box goes there when Enter is pressed', async () => {
  const { actions, screen } = await renderChrome()

  const box = await openGoToPage(screen)
  await box.fill('4')
  await userEvent.keyboard('{Enter}')

  expect(actions.onGoToPage).toHaveBeenCalledTimes(1)
  expect(actions.onGoToPage).toHaveBeenCalledWith('4')
})

test('after Enter the box closes and hands focus back to the counter', async () => {
  const { actions, screen } = await renderChrome()

  const box = await openGoToPage(screen)
  await box.fill('4')
  await userEvent.keyboard('{Enter}')

  await expect.element(screen.getByRole('button', { name: '3 / 6' })).toHaveFocus()
  expect(screen.getByRole('spinbutton', { name: /^Page/ }).query()).toBeNull()
  expect(actions.onGoToPage).toHaveBeenCalledTimes(1)
})

test('closing the box with Escape takes the number back', async () => {
  const { actions, screen } = await renderChrome()

  const box = await openGoToPage(screen)
  await box.fill('4')
  await userEvent.keyboard('{Escape}')

  await expect.element(screen.getByRole('button', { name: '3 / 6' })).toHaveFocus()
  expect(actions.onGoToPage).not.toHaveBeenCalled()

  // 다시 열면 빈 입력란이다. 물린 번호가 남아 있다가 나중에 넘어가지 않는다.
  await expect.element(await openGoToPage(screen)).toHaveValue('')
})

test('the arrow keys do not step the number in the box', async () => {
  const { actions, screen } = await renderChrome()

  await openGoToPage(screen)
  await userEvent.keyboard('{ArrowUp}{ArrowDown}')

  // 한 칸씩 옮길 때마다 넘어가면 다 적은 뒤의 한 번이라는 약속이 깨진다(`R-266`).
  expect(actions.onGoToPage).not.toHaveBeenCalled()
})

test('the row of controls turns around with the reading direction', async () => {
  const { screen } = await renderChrome({ direction: 'rtl' })

  const footer = screen.container.querySelector('footer')
  expect(footer && getComputedStyle(footer).flexDirection).toBe('row-reverse')
})

test('and reading left to right it stays as written', async () => {
  const { screen } = await renderChrome({ direction: 'ltr' })

  const footer = screen.container.querySelector('footer')
  expect(footer && getComputedStyle(footer).flexDirection).toBe('row')
})

test('the counter sits in the footer beside the slider', async () => {
  const { screen } = await renderChrome()

  await expect.element(screen.getByText('3 / 6')).toBeVisible()

  const footer = screen.container.querySelector('footer')
  expect(footer?.querySelector('[data-counter]')?.textContent).toBe('3 / 6')
  expect(screen.container.querySelector('header [data-counter]')).toBeNull()
})

test('a hidden chrome leaves neither bar behind', async () => {
  const { screen } = await renderChrome({ isChromeVisible: false })

  expect(screen.container.querySelector('header')).toBeNull()
  expect(screen.container.querySelector('footer')).toBeNull()
})

test('left and right arrows walk the menubar', async () => {
  const { screen } = await renderChrome()

  trigger(screen.container, 'Book').focus()

  await userEvent.keyboard('{ArrowRight}')
  expect(document.activeElement).toBe(
    screen.getByRole('menuitem', { name: 'View', exact: true }).element(),
  )

  await userEvent.keyboard('{ArrowRight}')
  expect(document.activeElement).toBe(
    screen.getByRole('menuitem', { name: 'Go', exact: true }).element(),
  )

  await userEvent.keyboard('{ArrowLeft}')
  expect(document.activeElement).toBe(
    screen.getByRole('menuitem', { name: 'View', exact: true }).element(),
  )
})

test('Enter opens a menu and Escape closes it again', async () => {
  const { screen } = await renderChrome()

  trigger(screen.container, 'Play').focus()

  await userEvent.keyboard('{Enter}')
  await expect.element(screen.getByRole('menuitem', { name: 'Start the slideshow' })).toBeVisible()

  await userEvent.keyboard('{Escape}')
  await expect
    .poll(() => screen.getByRole('menuitem', { name: 'Start the slideshow' }).elements().length)
    .toBe(0)
})

test('an open menu hands the arrow keys to its neighbour', async () => {
  const { screen } = await renderChrome()

  trigger(screen.container, 'Play').focus()
  await userEvent.keyboard('{Enter}')
  await expect.element(screen.getByRole('menuitem', { name: 'Start the slideshow' })).toBeVisible()

  await userEvent.keyboard('{ArrowRight}')

  await expect.element(screen.getByRole('menuitem', { name: 'Reading settings' })).toBeVisible()
})

test('every item shows the key that does the same thing', async () => {
  const { screen } = await renderChrome()

  await screen.getByRole('menuitem', { name: 'View', exact: true }).click()
  await expect.element(screen.getByRole('menuitem', { name: 'Zoom in' })).toBeVisible()

  const menu = openMenuElement(screen.container)
  const shown = [...(menu?.querySelectorAll('[data-shortcut]') ?? [])].map((key) => key.textContent)

  expect(shown).toEqual(['v', 'r', 's', '+', '-', 'f', 'h'])
})

test('no row is a checkbox: a row that changes what it does says so by its name', async () => {
  const { screen } = await renderChrome({ isBookmarked: true, isPlaying: true })

  for (const menu of ['Book', 'View', 'Go', 'Play', 'Settings']) {
    await screen.getByRole('menuitem', { name: menu, exact: true }).click()
    const open = openMenuElement(screen.container)
    await expect
      .poll(() => open?.querySelectorAll('[role="menuitem"]').length ?? 0)
      .toBeGreaterThan(0)
    // 읽는 방향의 라디오(`menuitemradio`)는 고르기라서 `aria-checked`를 진다. 세는 것은 그 밖이다.
    const checkable = '[role="menuitemcheckbox"], [role="menuitem"][aria-checked]'
    expect(open?.querySelectorAll(checkable).length).toBe(0)
    await userEvent.keyboard('{Escape}')
  }

  await screen.getByRole('menuitem', { name: 'Book', exact: true }).click()
  await expect
    .element(screen.getByRole('menuitem', { name: 'Remove bookmark from this page' }))
    .toBeVisible()
  await userEvent.keyboard('{Escape}')
  await screen.getByRole('menuitem', { name: 'Play', exact: true }).click()
  await expect.element(screen.getByRole('menuitem', { name: 'Stop the slideshow' })).toBeVisible()
})

test('reading left to right, it runs the usual way', async () => {
  const { screen } = await renderChrome({ direction: 'ltr' })

  const thumb = screen.getByRole('slider', { name: 'Page' })
  await expect.element(thumb).toHaveAttribute('aria-valuenow', '2')
  await expect.element(thumb).toHaveAttribute('aria-valuetext', 'Page 3')
  await expect.element(thumb).toHaveAttribute('aria-valuemin', '0')
  await expect.element(thumb).toHaveAttribute('aria-valuemax', '5')
})

test('reading right to left, the slider stands right to left and still counts pages', async () => {
  const { screen } = await renderChrome({ direction: 'rtl' })

  const thumb = screen.getByRole('slider', { name: 'Page' })
  // 값은 페이지 번호 그대로다. 첫 페이지를 오른쪽 끝에 두는 것은 `dir`이 한다.
  await expect.element(thumb).toHaveAttribute('aria-valuenow', '2')
  await expect.element(thumb).toHaveAttribute('aria-valuetext', 'Page 3')
  expect(thumb.element().closest('[dir]')?.getAttribute('dir')).toBe('rtl')
})

test('reading right to left, the filled part of the track sits on the right', async () => {
  const { screen } = await renderChrome({ direction: 'rtl' })

  const [track, fill] = trackAndFill(screen.container)
  const trackBox = track.getBoundingClientRect()
  const fillBox = fill.getBoundingClientRect()

  // 둘이 같은 색으로 풀리면 아래 비교는 무엇도 재지 못한다.
  expect(backgroundOf(track)).not.toBe(backgroundOf(fill))
  expect(backgroundOf(fill)).toBe(tokenColour(track, '--color-accent'))
  // 3페이지까지 읽었으니 오른쪽 끝에서 2/5만큼이 채워진다.
  expect(Math.abs(fillBox.right - trackBox.right)).toBeLessThan(1)
  expect(fillBox.width / trackBox.width).toBeCloseTo(0.4, 1)
})

test('reading left to right, the fill is the fill', async () => {
  const { screen } = await renderChrome({ direction: 'ltr' })

  const [track, fill] = trackAndFill(screen.container)
  const trackBox = track.getBoundingClientRect()
  const fillBox = fill.getBoundingClientRect()

  expect(backgroundOf(fill)).toBe(tokenColour(track, '--color-accent'))
  expect(Math.abs(fillBox.left - trackBox.left)).toBeLessThan(1)
  expect(fillBox.width / trackBox.width).toBeCloseTo(0.4, 1)
})

test('every page of a short book stands on the slider as a tick', async () => {
  const { screen } = await renderChrome()

  const ticks = [...screen.container.querySelectorAll<HTMLElement>('[data-mark-value]')]
  expect(ticks.map((tick) => tick.dataset.markValue)).toEqual(['0', '1', '2', '3', '4', '5'])
})

test('pressing a tick goes to that page', async () => {
  const { actions, screen } = await renderChrome()

  const tick = screen.container.querySelector<HTMLElement>('[data-mark-value="4"]')
  if (tick === null) throw new Error('눈금이 없다')
  const box = tick.getBoundingClientRect()
  tick.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    }),
  )

  expect(actions.onSlide).toHaveBeenLastCalledWith(4)
})

test('the slider moves by step, by page and to either end', async () => {
  const { actions, screen } = await renderChrome({ direction: 'ltr' })

  const thumb = screen.getByRole('slider', { name: 'Page' }).element()
  if (thumb instanceof HTMLElement) thumb.focus()

  await userEvent.keyboard('{ArrowRight}')
  expect(actions.onSlide).toHaveBeenLastCalledWith(3)

  await userEvent.keyboard('{ArrowLeft}')
  expect(actions.onSlide).toHaveBeenLastCalledWith(1)

  await userEvent.keyboard('{Home}')
  expect(actions.onSlide).toHaveBeenLastCalledWith(0)

  await userEvent.keyboard('{End}')
  expect(actions.onSlide).toHaveBeenLastCalledWith(5)

  await userEvent.keyboard('{PageUp}')
  expect(actions.onSlide).toHaveBeenLastCalledWith(5)

  await userEvent.keyboard('{PageDown}')
  expect(actions.onSlide).toHaveBeenLastCalledWith(0)
})

test('reading right to left, the slider keys follow what the eye sees', async () => {
  const { actions, screen } = await renderChrome({ direction: 'rtl' })

  const thumb = screen.getByRole('slider', { name: 'Page' }).element()
  if (thumb instanceof HTMLElement) thumb.focus()

  // 오른쪽 화살표는 트랙 위에서 오른쪽으로 가고, 그쪽이 책의 앞이다.
  await userEvent.keyboard('{ArrowRight}')
  expect(actions.onSlide).toHaveBeenLastCalledWith(1)

  await userEvent.keyboard('{ArrowLeft}')
  expect(actions.onSlide).toHaveBeenLastCalledWith(3)
  expect(actions.onSlide).toHaveBeenCalledTimes(2)
})

test('read from offers both directions and marks the one in use', async () => {
  const { screen } = await renderChrome({ direction: 'rtl' })

  await openReadFrom(screen)

  await expect
    .element(screen.getByRole('menuitemradio', { name: 'Right to left' }))
    .toHaveAttribute('aria-checked', 'true')
  await expect
    .element(screen.getByRole('menuitemradio', { name: 'Left to right' }))
    .toHaveAttribute('aria-checked', 'false')
})

test('choosing a direction asks for that direction, not a flip', async () => {
  const { actions, screen } = await renderChrome({ direction: 'rtl' })

  await openReadFrom(screen)
  await screen.getByRole('menuitemradio', { name: 'Left to right' }).click()

  expect(actions.onChooseDirection).toHaveBeenLastCalledWith('ltr')
})

test('fit to offers the four modes and marks the one in use', async () => {
  const { screen } = await renderChrome({ fit: 'width' })

  await openFitTo(screen)

  const radios = [...screen.container.querySelectorAll('[role="menuitemradio"]')]
    .filter((radio) => radio.closest('[aria-label="Fit to"]') !== null)
    .map((radio) => `${radio.textContent} ${radio.getAttribute('aria-checked')}`)
  expect(radios).toEqual(['Page false', 'Width true', 'Height false', 'Original size false'])
})

test('choosing a fit mode asks for that mode, not the next one', async () => {
  const { actions, screen } = await renderChrome({ fit: 'contain' })

  await openFitTo(screen)
  await screen.getByRole('menuitemradio', { name: 'Original size' }).click()

  expect(actions.onChooseFit).toHaveBeenLastCalledWith('original')
})

test('the left arrow in the read from flyout goes back to its row, not the next menu', async () => {
  const { screen } = await renderChrome()

  await openReadFrom(screen)
  await userEvent.keyboard('{ArrowLeft}')

  await expect.element(screen.getByRole('menuitem', { name: 'Read from' })).toHaveFocus()
  await expect.element(screen.getByRole('menuitem', { name: 'Zoom in' })).toBeVisible()
})

test('the menubar names its menus in the language the rest of the app speaks', async () => {
  const { screen } = await renderChrome()

  const names = [...screen.container.querySelectorAll('[role="menubar"] > [role="menuitem"]')].map(
    (item) => item.textContent,
  )

  expect(names).toEqual(['Book', 'View', 'Go', 'Play', 'Settings'])
})

test('Escape during a drag puts the slider back where the drag began', async () => {
  const { actions, screen, track, surface } = await renderDraggable()
  const box = track.getBoundingClientRect()
  const thumb = screen.getByRole('slider', { name: 'Page' })

  surface.dispatchEvent(pointerAt('pointerdown', box.right))
  await expect.element(thumb).toHaveAttribute('aria-valuenow', '5')

  surface.dispatchEvent(pointerAt('pointermove', box.left))
  await expect.element(thumb).toHaveAttribute('aria-valuenow', '0')

  const onDocumentKeyDown = vi.fn()
  document.addEventListener('keydown', onDocumentKeyDown)
  await userEvent.keyboard('{Escape}')
  document.removeEventListener('keydown', onDocumentKeyDown)

  await expect.element(thumb).toHaveAttribute('aria-valuenow', '2')
  expect(actions.onSlide).toHaveBeenLastCalledWith(2)
  // 무르려고 누른 Escape는 리더에게 가지 않는다 — 가면 한 겹이 더 벗겨진다.
  expect(onDocumentKeyDown).not.toHaveBeenCalled()

  // 포인터도 함께 놓았으므로 이어진 움직임은 아무것도 옮기지 않는다.
  expect(surface.hasPointerCapture(1)).toBe(false)
  surface.dispatchEvent(pointerAt('pointermove', box.left))
  await expect.element(thumb).toHaveAttribute('aria-valuenow', '2')
})

test('and an Escape with no drag to undo is left to the reader', async () => {
  const { actions, screen } = await renderDraggable()

  const thumb = screen.getByRole('slider', { name: 'Page' }).element()
  if (thumb instanceof HTMLElement) thumb.focus()

  const onDocumentKeyDown = vi.fn()
  document.addEventListener('keydown', onDocumentKeyDown)
  await userEvent.keyboard('{Escape}')
  document.removeEventListener('keydown', onDocumentKeyDown)

  expect(onDocumentKeyDown).toHaveBeenCalled()
  expect(actions.onSlide).not.toHaveBeenCalled()
})
