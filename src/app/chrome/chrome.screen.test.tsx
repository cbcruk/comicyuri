/**
 * 크롬 화면 테스트. 실제 Chromium에서 메뉴바를 세우고 눌러 본다.
 *
 * 보는 것은 셋이다. 예전 툴바가 가지고 있던 접근 가능한 이름이 하나도 빠지지
 * 않고 그대로 있고 저마다 자기 콜백을 부르는 것, 메뉴바가 네이티브 메뉴바처럼
 * 움직이는 것 — 좌우 화살표로 메뉴 사이를 오가고, Enter로 열리고, Escape로
 * 닫힌다 — 그리고 지금 걸린 값이 메뉴를 열지 않고도 헤더에서 읽히는 것이다.
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
  fileNames: ['page-003.jpg'],
  page: 2,
  pageCount: 6,
  direction: 'rtl',
  view: 'spread',
  fit: 'contain',
  isBookmarked: false,
  isThumbsOpen: false,
  isSettingsOpen: false,
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
  onToggleDirection: vi.fn(),
  onToggleView: vi.fn(),
  onCycleFit: vi.fn(),
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
    <Providers theme="dark">
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

/** 슬라이더의 트랙과 그 위를 덮는 채움. `R-264`는 이 둘의 색과 너비로 확인한다. */
const trackAndFill = (container: HTMLElement): readonly [HTMLElement, HTMLElement] => {
  const track = container.querySelector<HTMLElement>('[data-slider-track]')
  const fill = container.querySelector<HTMLElement>('[data-slider-fill]')
  if (track === null || fill === null) throw new Error('슬라이더가 없다')
  return [track, fill]
}

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
    <Providers theme="dark">
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

/** 메뉴 하나를 열고 그 안의 항목을 부른다. */
const chooseFromMenu = async (screen: Rendered, menu: string, item: string) => {
  await screen.getByRole('menuitem', { name: menu, exact: true }).click()
  await screen.getByRole('menuitem', { name: item, exact: true }).click()
}

/**
 * 메뉴 하나를 열고 그 안의 켜고 끄는 항목을 부른다. 그런 항목은
 * `menuitemcheckbox`라 역할이 다르다.
 */
const toggleFromMenu = async (screen: Rendered, menu: string, item: string) => {
  await screen.getByRole('menuitem', { name: menu, exact: true }).click()
  await screen.getByRole('menuitemcheckbox', { name: item, exact: true }).click()
}

test('the book menu carries the shelf, the bookmark and the page grid', async () => {
  const { actions, screen } = await renderChrome()

  await chooseFromMenu(screen, 'Book', '← Shelf')
  expect(actions.onExit).toHaveBeenCalled()

  await toggleFromMenu(screen, 'Book', 'Bookmark this page')
  expect(actions.onToggleBookmark).toHaveBeenCalled()

  await toggleFromMenu(screen, 'Book', 'Show every page')
  expect(actions.onToggleThumbs).toHaveBeenCalled()
})

test('a bookmarked page offers to take the bookmark away instead', async () => {
  const { actions, screen } = await renderChrome({ isBookmarked: true })

  await toggleFromMenu(screen, 'Book', 'Remove bookmark from this page')
  expect(actions.onToggleBookmark).toHaveBeenCalled()
})

test('the view menu carries every control that changes how a page is shown', async () => {
  const { actions, screen } = await renderChrome()

  await chooseFromMenu(screen, 'View', 'Toggle reading direction')
  expect(actions.onToggleDirection).toHaveBeenCalled()

  await chooseFromMenu(screen, 'View', 'Toggle one or two pages')
  expect(actions.onToggleView).toHaveBeenCalled()

  await chooseFromMenu(screen, 'View', 'Change how pages are fitted')
  expect(actions.onCycleFit).toHaveBeenCalled()

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

  await toggleFromMenu(screen, 'Play', 'Stop the slideshow')
  expect(actions.onToggleSlideshow).toHaveBeenCalled()
})

test('the play menu starts the slideshow and the settings menu opens the panel', async () => {
  const { actions, screen } = await renderChrome()

  await toggleFromMenu(screen, 'Play', 'Start the slideshow')
  expect(actions.onToggleSlideshow).toHaveBeenCalled()

  await toggleFromMenu(screen, 'Settings', 'Reading settings')
  expect(actions.onToggleSettings).toHaveBeenCalled()
})

test('the go menu steps through bookmarks and sends focus to the page box', async () => {
  const { actions, screen } = await renderChrome()

  await chooseFromMenu(screen, 'Go', 'Next bookmark')
  expect(actions.onStepBookmark).toHaveBeenCalledWith(1)

  await chooseFromMenu(screen, 'Go', 'Previous bookmark')
  expect(actions.onStepBookmark).toHaveBeenCalledWith(-1)

  await chooseFromMenu(screen, 'Go', 'Go to page')
  expect(document.activeElement).toBe(
    screen.getByRole('spinbutton', { name: 'Go to page' }).element(),
  )
})

test('the footer turns the page and names its slider "Page"', async () => {
  const { actions, screen } = await renderChrome()

  await screen.getByRole('button', { name: 'First' }).click()
  expect(actions.onFirst).toHaveBeenCalled()

  await screen.getByRole('button', { name: 'Previous' }).click()
  expect(actions.onPrevious).toHaveBeenCalled()

  await screen.getByRole('button', { name: 'Next', exact: true }).click()
  expect(actions.onNext).toHaveBeenCalled()

  await screen.getByRole('button', { name: 'Last' }).click()
  expect(actions.onLast).toHaveBeenCalled()

  await expect.element(screen.getByRole('slider', { name: 'Page' })).toBeVisible()
})

test('a number in the box goes there when Enter is pressed', async () => {
  const { actions, screen } = await renderChrome()

  const box = screen.getByRole('spinbutton', { name: 'Go to page' })
  await box.fill('4')
  await userEvent.keyboard('{Enter}')

  expect(actions.onGoToPage).toHaveBeenCalledWith('4')
})

test('the row of controls turns around with the reading direction', async () => {
  const { screen } = await renderChrome({ direction: 'rtl' })

  const footer = screen.container.querySelector('footer')
  expect(footer?.className).toContain('flex-row-reverse')
})

test('and reading left to right it stays as written', async () => {
  const { screen } = await renderChrome({ direction: 'ltr' })

  const footer = screen.container.querySelector('footer')
  expect(footer?.className).not.toContain('flex-row-reverse')
})

test('the counter and the file name sit above the reader', async () => {
  const { screen } = await renderChrome({ fileNames: ['page-003.jpg', 'page-004.jpg'] })

  await expect.element(screen.getByText('3 / 6')).toBeVisible()
  await expect.element(screen.getByTitle('page-003.jpg · page-004.jpg')).toBeVisible()
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
  await expect
    .element(screen.getByRole('menuitemcheckbox', { name: 'Start the slideshow' }))
    .toBeVisible()

  await userEvent.keyboard('{Escape}')
  await expect
    .poll(
      () => screen.getByRole('menuitemcheckbox', { name: 'Start the slideshow' }).elements().length,
    )
    .toBe(0)
})

test('an open menu hands the arrow keys to its neighbour', async () => {
  const { screen } = await renderChrome()

  trigger(screen.container, 'Play').focus()
  await userEvent.keyboard('{Enter}')
  await expect
    .element(screen.getByRole('menuitemcheckbox', { name: 'Start the slideshow' }))
    .toBeVisible()

  await userEvent.keyboard('{ArrowRight}')

  await expect
    .element(screen.getByRole('menuitemcheckbox', { name: 'Reading settings' }))
    .toBeVisible()
})

test('every item shows the key that does the same thing', async () => {
  const { screen } = await renderChrome()

  await screen.getByRole('menuitem', { name: 'View', exact: true }).click()
  await expect.element(screen.getByRole('menuitem', { name: 'Zoom in' })).toBeVisible()

  const menu = openMenuElement(screen.container)
  const shown = [...(menu?.querySelectorAll('[data-shortcut]') ?? [])].map((key) => key.textContent)

  expect(shown).toEqual(['d', 'v', 'r', 's', '+', '-', 'f', 'h'])
})

test('a bookmarked page, an open grid and an open panel all say so on their row', async () => {
  const { screen } = await renderChrome({
    isBookmarked: true,
    isThumbsOpen: true,
    isSettingsOpen: true,
  })

  await screen.getByRole('menuitem', { name: 'Book', exact: true }).click()
  await expect
    .element(screen.getByRole('menuitemcheckbox', { name: 'Remove bookmark from this page' }))
    .toHaveAttribute('aria-checked', 'true')
  await expect
    .element(screen.getByRole('menuitemcheckbox', { name: 'Show every page' }))
    .toHaveAttribute('aria-expanded', 'true')

  await screen.getByRole('menuitem', { name: 'Settings', exact: true }).click()
  const settings = screen.getByRole('menuitemcheckbox', { name: 'Reading settings' })
  await expect.element(settings).toHaveAttribute('aria-checked', 'true')
  await expect.element(settings).toHaveAttribute('aria-expanded', 'true')
})

test('a running slideshow says so on its row', async () => {
  const { screen } = await renderChrome({ isPlaying: true })

  await screen.getByRole('menuitem', { name: 'Play', exact: true }).click()
  await expect
    .element(screen.getByRole('menuitemcheckbox', { name: 'Stop the slideshow' }))
    .toHaveAttribute('aria-checked', 'true')
})

test('and a stopped one says that', async () => {
  const { screen } = await renderChrome()

  await screen.getByRole('menuitem', { name: 'Play', exact: true }).click()
  await expect
    .element(screen.getByRole('menuitemcheckbox', { name: 'Start the slideshow' }))
    .toHaveAttribute('aria-checked', 'false')
})

test('a page with no bookmark leaves its row unchecked', async () => {
  const { screen } = await renderChrome()

  await screen.getByRole('menuitem', { name: 'Book', exact: true }).click()
  await expect
    .element(screen.getByRole('menuitemcheckbox', { name: 'Bookmark this page' }))
    .toHaveAttribute('aria-checked', 'false')
})

test('hiding the toolbar is a command, not a state', async () => {
  const { screen } = await renderChrome()

  await screen.getByRole('menuitem', { name: 'View', exact: true }).click()

  const hide = screen.getByRole('menuitem', { name: 'Hide the toolbar', exact: true })
  await expect.element(hide).toBeVisible()
  expect(hide.element().hasAttribute('aria-checked')).toBe(false)
})

test('reading left to right, it runs the usual way', async () => {
  const { screen } = await renderChrome({ direction: 'ltr' })

  const thumb = screen.getByRole('slider', { name: 'Page' })
  await expect.element(thumb).toHaveAttribute('aria-valuenow', '2')
  await expect.element(thumb).toHaveAttribute('aria-valuetext', 'Page 3')
  await expect.element(thumb).toHaveAttribute('aria-valuemin', '0')
  await expect.element(thumb).toHaveAttribute('aria-valuemax', '5')
})

test('reading right to left, the slider starts full and empties leftward', async () => {
  const { screen } = await renderChrome({ direction: 'rtl' })

  const thumb = screen.getByRole('slider', { name: 'Page' })
  // 3페이지, 여섯 장짜리 책. 오른쪽에서 왼쪽이면 자리는 뒤집히고 번호는 그대로다.
  await expect.element(thumb).toHaveAttribute('aria-valuenow', '3')
  await expect.element(thumb).toHaveAttribute('aria-valuetext', 'Page 3')
})

test('reading right to left, the filled part of the track sits on the right', async () => {
  const { screen } = await renderChrome({ direction: 'rtl' })

  const [track, fill] = trackAndFill(screen.container)

  expect(track.className).toContain('bg-accent')
  expect(fill.className).toContain('bg-edge')
  // 3페이지까지 읽었으니 왼쪽 3/5는 아직 읽지 않은 몫이다.
  expect(fill.style.width).toBe('60%')
})

test('reading left to right, the fill is the fill', async () => {
  const { screen } = await renderChrome({ direction: 'ltr' })

  const [track, fill] = trackAndFill(screen.container)

  expect(track.className).toContain('bg-edge')
  expect(fill.className).toContain('bg-accent')
  expect(fill.style.width).toBe('40%')
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
})

test('the header says which way it reads, how many pages and how they fit', async () => {
  const { screen } = await renderChrome({ direction: 'rtl', view: 'spread', fit: 'width' })

  const status = screen.getByRole('status', { name: 'Reading state' })
  await expect.element(status).toBeVisible()
  expect(status.element().textContent).toBe('RTL · Two · Width')
})

test('and it says so too while the slideshow runs', async () => {
  const { screen } = await renderChrome({
    direction: 'ltr',
    view: 'single',
    fit: 'original',
    isPlaying: true,
  })

  expect(screen.getByRole('status', { name: 'Reading state' }).element().textContent).toBe(
    'LTR · One · 1:1 · Playing',
  )
})

test('the values stand beside the counter, and the counter still comes first', async () => {
  const { screen } = await renderChrome()

  // 메뉴 안의 곁글과 달리 보조기기가 닿는다.
  const status = screen.getByRole('status', { name: 'Reading state' }).element()
  expect(status.closest('[aria-hidden="true"]')).toBeNull()

  // e2e는 헤더의 첫 `span`으로 카운터를 읽는다. 지금 값 줄이 그 앞에 서면 안 된다.
  expect(screen.container.querySelector('header span')?.textContent).toBe('3 / 6')
  expect(screen.container.querySelector('header')?.contains(status)).toBe(true)
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
