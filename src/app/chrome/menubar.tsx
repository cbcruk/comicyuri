/**
 * 리더의 메뉴바. 예전 툴바에 한 줄로 늘어서 있던 버튼 열네 개를 다섯 메뉴로
 * 나눈 것이다.
 *
 * Astryx에는 Menubar가 없어서 `DropdownMenu` 다섯을 `role="menubar"` 한 줄에
 * 세우고, 그 줄의 좌우 화살표는 Astryx의 `Toolbar`가 쓰는 것과 같은
 * `useListFocus`로 굴린다. `Toolbar` 자체를 쓰지 못하는 이유는 그것이 항목을
 * `'button, input, [tabindex]'`로 고정해 세기 때문이다 — 메뉴의 팝오버는
 * 포털이 아니라 제자리에 서므로, 닫혀 있는 메뉴의 항목까지 그 줄의 차례에
 * 끌려 들어온다.
 *
 * 상태를 지는 항목은 `DropdownMenuCheckboxItem`이다. 예전 툴바 버튼이 `aria-pressed`
 * 와 `aria-expanded`로 말하던 것을 `menuitemcheckbox`의 `aria-checked`가 이어받고,
 * 패널을 여는 둘은 `aria-expanded`도 함께 진다 — `R-271`과 `R-2B1`이 그것으로
 * 확인된다. 나머지는 상태가 아니라 명령이므로 평범한 `menuitem`으로 둔다.
 */

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuDivider,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSubMenu,
} from '@astryxdesign/core/DropdownMenu'
import * as stylex from '@stylexjs/stylex'
import { useListFocus } from '@astryxdesign/core/hooks'
import { HStack } from '@astryxdesign/core/HStack'
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from '@astryxdesign/core/theme/tokens.stylex'
import { Schema } from 'effect'
import type { KeyboardEvent, ReactNode } from 'react'
import { useCallback, useState } from 'react'

import { ReadingDirection } from '../../types.ts'
import type { FitMode } from '../../types.ts'
import { SHORTCUTS } from './shortcuts.ts'
import type { ChromeActions, ChromeState } from './types.ts'

/** 메뉴바에 선 메뉴들, 왼쪽부터. 좌우 화살표가 이 차례를 따라 돈다. */
const MENU_IDS = ['book', 'view', 'go', 'play', 'settings'] as const

/** {@linkcode MENU_IDS}의 한 칸. */
type MenuId = (typeof MENU_IDS)[number]

/**
 * 트리거에 적히는 이름. 네이티브 메뉴바처럼 한 낱말이다.
 *
 * 앱의 다른 모든 문구와 같이 영어다 — 한국어는 주석·커밋·`SPEC.md`의 것이지
 * 화면에 적히는 글자의 것이 아니다.
 */
const MENU_LABELS: Readonly<Record<MenuId, string>> = {
  book: 'Book',
  view: 'View',
  go: 'Go',
  play: 'Play',
  settings: 'Settings',
}

/**
 * 맞춤 모드가 적히는 이름. 예전 툴바 버튼의 글자와 같다(`R-224`).
 */
const FIT_LABEL: Readonly<Record<FitMode, string>> = {
  contain: 'Fit',
  width: 'Width',
  height: 'Height',
  original: '1:1',
}

/** 메뉴바와 곁글의 모양. */
const styles = stylex.create({
  hint: {
    fontSize: textSizeVars['--font-size-sm'],
    color: colorVars['--color-text-secondary'],
  },
  key: {
    paddingInline: spacingVars['--spacing-1'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-inner'],
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
})

/**
 * 메뉴 항목 오른쪽에 붙는 곁글. 지금 걸린 값과 단축키다.
 *
 * `aria-hidden`인 이유는 항목의 접근 가능한 이름이 그 안의 글자에서 나오기
 * 때문이다. 이것이 이름에 섞이면 "Zoom in"이 "Zoom in +"가 되고, 그 이름으로
 * 버튼을 찾는 시험들이 모두 어긋난다.
 */
const MenuHint = ({ value, shortcut }: Readonly<{ value?: string; shortcut?: string }>) => (
  <HStack
    as="span"
    aria-hidden="true"
    align="center"
    gap={2}
    paddingInlineStart={6}
    xstyle={styles.hint}
  >
    {value === undefined ? null : <span>{value}</span>}
    {shortcut === undefined ? null : (
      <kbd data-shortcut={shortcut} {...stylex.props(styles.key)}>
        {shortcut}
      </kbd>
    )}
  </HStack>
)

/**
 * 키가 서브메뉴의 flyout 안에서 눌렸는지. 메뉴 안의 메뉴가 곧 flyout이다.
 *
 * 그 안의 좌우 화살표는 서브메뉴의 것이다 — 왼쪽은 flyout을 닫고 트리거로 돌아가는데,
 * 메뉴바가 그것까지 가로채면 옆 메뉴가 열려 버린다.
 */
const isInSubMenu = (target: EventTarget): boolean =>
  target instanceof Element && target.closest('[role="menu"] [role="menu"]') !== null

/** 메뉴 하나. 열림 여부를 메뉴바가 쥐므로 그것만 밖에서 받는다. */
const Menu = ({
  id,
  openMenu,
  onOpenChange,
  children,
}: Readonly<{
  id: MenuId
  openMenu: MenuId | null
  onOpenChange: (id: MenuId, isOpen: boolean) => void
  children: ReactNode
}>) => (
  <DropdownMenu
    button={{
      label: MENU_LABELS[id],
      // 메뉴바의 자식은 `menuitem`이어야 한다. Astryx의 트리거는 버튼이지만
      // `role`을 받아 그대로 내보내므로 여기서 바꿔 단다.
      role: 'menuitem',
      variant: 'ghost',
      size: 'sm',
    }}
    hasChevron={false}
    isMenuOpen={openMenu === id}
    onOpenChange={(isOpen) => onOpenChange(id, isOpen)}
  >
    {children}
  </DropdownMenu>
)

/** 메뉴바가 받는 것. */
export type MenubarProps = Readonly<{
  state: ChromeState
  actions: ChromeActions
  /**
   * "Go to page" 항목이 부르는 것. 번호를 적는 자리는 푸터에 있으므로, 메뉴는
   * 그리로 포커스를 보내는 일만 한다. 푸터 없이 메뉴바만 세울 때는 비워 둔다.
   */
  onFocusGoToPage?: () => void
}>

/**
 * 리더의 메뉴바 한 줄.
 *
 * 좌우 화살표는 두 가지로 움직인다. 메뉴가 모두 닫혀 있으면 `useListFocus`의
 * roving tabindex가 트리거 사이로 포커스를 옮기고, 하나가 열려 있으면 이
 * 컴포넌트가 먼저 가로채 옆 메뉴를 대신 연다 — 네이티브 메뉴바가 그렇게
 * 움직인다. 위아래 화살표·Enter·Escape·글자로 찾기는 `DropdownMenu`의 것이다.
 */
export const ReaderMenubar = ({ state, actions, onFocusGoToPage }: MenubarProps) => {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null)

  const { listRef, handleKeyDown, handleFocus } = useListFocus<HTMLDivElement>({
    itemSelector: '[role="menuitem"]',
    // 메뉴 항목도 `menuitem`이고 팝오버가 제자리에 서므로, 경계를 주지 않으면
    // 이 줄이 자기 트리거와 남의 항목을 한 줄로 센다.
    boundarySelector: '[role="menubar"],[role="menu"]',
    orientation: 'horizontal',
    hasRovingTabIndex: true,
  })

  /**
   * 열린 메뉴를 갈아 끼운다.
   *
   * 닫힘은 자기 것일 때만 받는다. 옆 메뉴로 옮겨 갈 때 떠나는 메뉴가 뒤늦게
   * "닫혔다"고 알려 오는데, 그것을 그대로 받으면 방금 연 메뉴가 같이 닫힌다.
   */
  const changeOpen = useCallback((id: MenuId, isOpen: boolean) => {
    setOpenMenu((previous) => (isOpen ? id : previous === id ? null : previous))
  }, [])

  const handleMenubarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0

    if (openMenu !== null && step !== 0 && !isInSubMenu(event.target)) {
      event.preventDefault()
      const at = MENU_IDS.indexOf(openMenu)
      setOpenMenu(MENU_IDS[(at + step + MENU_IDS.length) % MENU_IDS.length] ?? null)
      return
    }

    // 메뉴를 닫은 Escape가 문서까지 올라가면 리더가 그것을 책을 떠나라는 뜻으로
    // 읽는다. 리더의 키 구독은 document에 걸려 있으므로 네이티브 쪽을 멈춘다.
    if (openMenu !== null && event.key === 'Escape') {
      event.nativeEvent.stopPropagation()
      return
    }

    handleKeyDown(event)
  }

  return (
    <HStack
      ref={listRef}
      role="menubar"
      aria-label="Reader menus"
      aria-orientation="horizontal"
      align="center"
      gap={1}
      onKeyDown={handleMenubarKeyDown}
      onFocus={handleFocus}
    >
      <Menu id="book" openMenu={openMenu} onOpenChange={changeOpen}>
        <DropdownMenuItem
          label="← Shelf"
          onClick={actions.onExit}
          endContent={<MenuHint shortcut={SHORTCUTS.exit} />}
        />
        <DropdownMenuCheckboxItem
          label={state.isBookmarked ? 'Remove bookmark from this page' : 'Bookmark this page'}
          value={state.isBookmarked}
          onChange={actions.onToggleBookmark}
          hasCloseOnSelect
          endContent={<MenuHint shortcut={SHORTCUTS.bookmark} />}
        />
        <DropdownMenuCheckboxItem
          label="Show every page"
          value={state.isThumbsOpen}
          aria-expanded={state.isThumbsOpen}
          onChange={actions.onToggleThumbs}
          hasCloseOnSelect
          endContent={<MenuHint shortcut={SHORTCUTS.thumbs} />}
        />
      </Menu>

      <Menu id="view" openMenu={openMenu} onOpenChange={changeOpen}>
        {/*
          뒤집기가 아니라 고르기다. 두 값이 나란히 서고 걸린 쪽에 표시가 붙으므로,
          지금 어느 쪽인지 따로 적어 둘 곁글이 없다(`R-221`).
        */}
        <DropdownMenuSubMenu label="Read from">
          <DropdownMenuRadioGroup
            label="Read from"
            value={state.direction}
            onChange={(value) => {
              if (Schema.is(ReadingDirection)(value)) actions.onChooseDirection(value)
            }}
          >
            <DropdownMenuRadioItem value="rtl" label="Right to left" />
            <DropdownMenuRadioItem value="ltr" label="Left to right" />
          </DropdownMenuRadioGroup>
        </DropdownMenuSubMenu>
        <DropdownMenuItem
          label="Toggle one or two pages"
          onClick={actions.onToggleView}
          endContent={
            <MenuHint value={state.view === 'spread' ? 'Two' : 'One'} shortcut={SHORTCUTS.view} />
          }
        />
        <DropdownMenuItem
          label="Change how pages are fitted"
          onClick={actions.onCycleFit}
          endContent={<MenuHint value={FIT_LABEL[state.fit]} />}
        />
        <DropdownMenuItem
          label="Turn the page a quarter clockwise"
          onClick={actions.onRotate}
          endContent={<MenuHint shortcut={SHORTCUTS.rotate} />}
        />
        {/* 한 장 모드에는 뒤집을 묶기가 없으므로 자리도 두지 않는다(`R-227`). */}
        {state.view === 'spread' ? (
          <DropdownMenuItem
            label="Flip how this spread is paired"
            onClick={actions.onToggleBinding}
            endContent={<MenuHint shortcut={SHORTCUTS.binding} />}
          />
        ) : null}
        <DropdownMenuDivider />
        <DropdownMenuItem
          label="Zoom in"
          onClick={actions.onZoomIn}
          endContent={<MenuHint shortcut={SHORTCUTS.zoomIn} />}
        />
        <DropdownMenuItem
          label="Zoom out"
          onClick={actions.onZoomOut}
          endContent={<MenuHint shortcut={SHORTCUTS.zoomOut} />}
        />
        <DropdownMenuDivider />
        <DropdownMenuItem
          label={state.isFullscreen ? 'Leave fullscreen' : 'Enter fullscreen'}
          onClick={actions.onToggleFullscreen}
          endContent={<MenuHint shortcut={SHORTCUTS.fullscreen} />}
        />
        {/*
          숨기기는 상태가 아니라 명령이다. 이 항목이 보이는 동안 툴바는 언제나 서
          있으므로 체크 상자로 두면 늘 "체크 안 됨"이라 읽히고, 그것은 실제로
          작동하는 버튼에 대해 틀린 말을 하는 셈이다.
        */}
        <DropdownMenuItem
          label="Hide the toolbar"
          onClick={actions.onToggleChrome}
          endContent={<MenuHint shortcut={SHORTCUTS.chrome} />}
        />
      </Menu>

      <Menu id="go" openMenu={openMenu} onOpenChange={changeOpen}>
        <DropdownMenuItem
          label="First"
          onClick={actions.onFirst}
          endContent={<MenuHint shortcut={SHORTCUTS.first} />}
        />
        <DropdownMenuItem
          label="Previous"
          onClick={actions.onPrevious}
          endContent={<MenuHint shortcut={SHORTCUTS.previous} />}
        />
        <DropdownMenuItem
          label="Next"
          onClick={actions.onNext}
          endContent={<MenuHint shortcut={SHORTCUTS.next} />}
        />
        <DropdownMenuItem
          label="Last"
          onClick={actions.onLast}
          endContent={<MenuHint shortcut={SHORTCUTS.last} />}
        />
        <DropdownMenuDivider />
        <DropdownMenuItem
          label="Go to page"
          onClick={onFocusGoToPage}
          isDisabled={onFocusGoToPage === undefined}
        />
        <DropdownMenuDivider />
        <DropdownMenuItem
          label="Next bookmark"
          onClick={() => actions.onStepBookmark(1)}
          endContent={<MenuHint shortcut={SHORTCUTS.nextBookmark} />}
        />
        <DropdownMenuItem
          label="Previous bookmark"
          onClick={() => actions.onStepBookmark(-1)}
          endContent={<MenuHint shortcut={SHORTCUTS.previousBookmark} />}
        />
      </Menu>

      <Menu id="play" openMenu={openMenu} onOpenChange={changeOpen}>
        <DropdownMenuCheckboxItem
          label={state.isPlaying ? 'Stop the slideshow' : 'Start the slideshow'}
          value={state.isPlaying}
          onChange={actions.onToggleSlideshow}
          hasCloseOnSelect
          endContent={<MenuHint shortcut={SHORTCUTS.slideshow} />}
        />
      </Menu>

      <Menu id="settings" openMenu={openMenu} onOpenChange={changeOpen}>
        <DropdownMenuCheckboxItem
          label="Reading settings"
          value={state.isSettingsOpen}
          aria-expanded={state.isSettingsOpen}
          onChange={actions.onToggleSettings}
          hasCloseOnSelect
          endContent={<MenuHint shortcut={SHORTCUTS.settings} />}
        />
      </Menu>
    </HStack>
  )
}
