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
 * 항목은 모두 평범한 `menuitem`이다. 체크 상자(`menuitemcheckbox`)로 둘 만한 것이 없다.
 * 상태에 따라 하는 일이 바뀌는 항목은 이름이 그것을 말하고(`Bookmark this page` ↔
 * `Remove bookmark from this page`), 여기에 `aria-checked`까지 얹으면 같은 말을 두 번
 * 한다. 패널을 여는 항목은 패널이 메뉴바를 덮으므로 "열림"이 읽힐 때가 없다 — 늘 "체크
 * 안 됨"이라 말하는 체크 상자는 틀린 말을 하는 셈이다. 읽는 방향만은 두 값 가운데 하나를
 * 고르는 것이라 `menuitemradio`다(`R-221`).
 */

import {
  DropdownMenu,
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
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useCallback, useState } from 'react'

import type { Translate } from '../i18n/format.ts'
import { useMessages } from '../i18n/messages.ts'
import { FitMode, ReadingDirection } from '../../types.ts'
import { SHORTCUTS } from './shortcuts.ts'
import type { ChromeActions, ChromeState } from './types.ts'

/** 메뉴바에 선 메뉴들, 왼쪽부터. 좌우 화살표가 이 차례를 따라 돈다. */
const MENU_IDS = ['book', 'view', 'go', 'play', 'settings'] as const

/** {@linkcode MENU_IDS}의 한 칸. */
type MenuId = (typeof MENU_IDS)[number]

/**
 * `Fit to` 서브메뉴에 서는 맞춤 모드들, 위에서부터(`R-224`).
 *
 * 이름은 서브메뉴 이름에 이어 읽힌다 — "Fit to Page", "Fit to Width". 원래 크기만은 맞추는
 * 것이 아니라서 제 이름을 그대로 쓴다.
 */
const fitChoices = (t: Translate): ReadonlyArray<Readonly<{ fit: FitMode; label: string }>> => [
  { fit: 'contain', label: t('item.fitPage') },
  { fit: 'width', label: t('item.fitWidth') },
  { fit: 'height', label: t('item.fitHeight') },
  { fit: 'original', label: t('item.fitOriginal') },
]

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

/**
 * 눌린 것이 메뉴 안에서 명령을 끝내는 항목인지. 서브메뉴를 여는 행은 명령이 아니라
 * 한 겹 더 들어가는 길이므로 세지 않는다.
 */
const isChosenItem = (target: EventTarget): boolean =>
  target instanceof Element &&
  target.closest(
    '[role="menu"] :is([role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]):not([aria-haspopup])',
  ) !== null

/** 메뉴 하나. 열림 여부를 메뉴바가 쥐므로 그것만 밖에서 받는다. */
const Menu = ({
  id,
  label,
  openMenu,
  onOpenChange,
  children,
}: Readonly<{
  id: MenuId
  label: string
  openMenu: MenuId | null
  onOpenChange: (id: MenuId, isOpen: boolean) => void
  children: ReactNode
}>) => (
  <DropdownMenu
    button={{
      label,
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
   * "Go to page" 항목이 부르는 것. 번호를 적는 창은 푸터의 카운터가 열므로,
   * 메뉴는 그것을 여는 일만 한다. 푸터 없이 메뉴바만 세울 때는 비워 둔다.
   */
  onOpenGoToPage?: () => void
}>

/**
 * 리더의 메뉴바 한 줄.
 *
 * 좌우 화살표는 두 가지로 움직인다. 메뉴가 모두 닫혀 있으면 `useListFocus`의
 * roving tabindex가 트리거 사이로 포커스를 옮기고, 하나가 열려 있으면 이
 * 컴포넌트가 먼저 가로채 옆 메뉴를 대신 연다 — 네이티브 메뉴바가 그렇게
 * 움직인다. 위아래 화살표·Enter·Escape·글자로 찾기는 `DropdownMenu`의 것이다.
 */
export const ReaderMenubar = ({ state, actions, onOpenGoToPage }: MenubarProps) => {
  const t = useMessages()
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

  /**
   * 항목으로 명령을 고른 뒤에는 포커스를 메뉴바에서 놓는다.
   *
   * 메뉴가 닫히면 포커스가 트리거로 돌아오는데, 리더는 메뉴바 위의 키를 양보하므로
   * (`R-265`) 그대로 두면 `]`나 화살표가 먹히지 않는다. 넘김이 Go 메뉴에만 있어서, 넘긴
   * 다음 키로 이어 가는 일이 흔하다. 돌아오는 것은 닫힘 뒤라 한 프레임 기다린다.
   */
  const handleMenubarClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isChosenItem(event.target)) return
    const menubar = event.currentTarget
    requestAnimationFrame(() => {
      const focused = document.activeElement
      if (focused instanceof HTMLElement && menubar.contains(focused)) focused.blur()
    })
  }

  return (
    <HStack
      ref={listRef}
      onClick={handleMenubarClick}
      role="menubar"
      aria-label={t('menu.bar')}
      aria-orientation="horizontal"
      align="center"
      gap={1}
      onKeyDown={handleMenubarKeyDown}
      onFocus={handleFocus}
    >
      <Menu id="book" label={t('menu.book')} openMenu={openMenu} onOpenChange={changeOpen}>
        <DropdownMenuItem
          label={t('item.shelf')}
          onClick={actions.onExit}
          endContent={<MenuHint shortcut={SHORTCUTS.exit} />}
        />
        <DropdownMenuItem
          label={state.isBookmarked ? t('item.removeBookmark') : t('item.addBookmark')}
          onClick={actions.onToggleBookmark}
          endContent={<MenuHint shortcut={SHORTCUTS.bookmark} />}
        />
        <DropdownMenuItem
          label={t('item.everyPage')}
          onClick={actions.onToggleThumbs}
          endContent={<MenuHint shortcut={SHORTCUTS.thumbs} />}
        />
      </Menu>

      <Menu id="view" label={t('menu.view')} openMenu={openMenu} onOpenChange={changeOpen}>
        {/*
          뒤집기가 아니라 고르기다. 두 값이 나란히 서고 걸린 쪽에 표시가 붙으므로,
          지금 어느 쪽인지 따로 적어 둘 곁글이 없다(`R-221`).
        */}
        <DropdownMenuSubMenu label={t('item.readFrom')}>
          <DropdownMenuRadioGroup
            label={t('item.readFrom')}
            value={state.direction}
            onChange={(value) => {
              if (Schema.is(ReadingDirection)(value)) actions.onChooseDirection(value)
            }}
          >
            <DropdownMenuRadioItem value="rtl" label={t('item.rightToLeft')} />
            <DropdownMenuRadioItem value="ltr" label={t('item.leftToRight')} />
          </DropdownMenuRadioGroup>
        </DropdownMenuSubMenu>
        <DropdownMenuItem
          label={t('item.toggleView')}
          onClick={actions.onToggleView}
          endContent={
            <MenuHint
              value={state.view === 'spread' ? t('item.twoPages') : t('item.onePage')}
              shortcut={SHORTCUTS.view}
            />
          }
        />
        {/* 순환이 아니라 고르기다. 원하는 모드까지 여러 번 열고 누를 일이 없다(`R-224`). */}
        <DropdownMenuSubMenu label={t('item.fitTo')}>
          <DropdownMenuRadioGroup
            label={t('item.fitTo')}
            value={state.fit}
            onChange={(value) => {
              if (Schema.is(FitMode)(value)) actions.onChooseFit(value)
            }}
          >
            {fitChoices(t).map(({ fit, label }) => (
              <DropdownMenuRadioItem key={fit} value={fit} label={label} />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubMenu>
        <DropdownMenuItem
          label={t('item.rotate')}
          onClick={actions.onRotate}
          endContent={<MenuHint shortcut={SHORTCUTS.rotate} />}
        />
        {/* 한 장 모드에는 뒤집을 묶기가 없으므로 자리도 두지 않는다(`R-227`). */}
        {state.view === 'spread' ? (
          <DropdownMenuItem
            label={t('item.flipBinding')}
            onClick={actions.onToggleBinding}
            endContent={<MenuHint shortcut={SHORTCUTS.binding} />}
          />
        ) : null}
        <DropdownMenuDivider />
        <DropdownMenuItem
          label={t('item.zoomIn')}
          onClick={actions.onZoomIn}
          endContent={<MenuHint shortcut={SHORTCUTS.zoomIn} />}
        />
        <DropdownMenuItem
          label={t('item.zoomOut')}
          onClick={actions.onZoomOut}
          endContent={<MenuHint shortcut={SHORTCUTS.zoomOut} />}
        />
        <DropdownMenuDivider />
        <DropdownMenuItem
          label={state.isFullscreen ? t('item.leaveFullscreen') : t('item.enterFullscreen')}
          onClick={actions.onToggleFullscreen}
          endContent={<MenuHint shortcut={SHORTCUTS.fullscreen} />}
        />
        <DropdownMenuItem
          label={t('item.hideToolbar')}
          onClick={actions.onToggleChrome}
          endContent={<MenuHint shortcut={SHORTCUTS.chrome} />}
        />
      </Menu>

      <Menu id="go" label={t('menu.go')} openMenu={openMenu} onOpenChange={changeOpen}>
        <DropdownMenuItem
          label={t('item.first')}
          onClick={actions.onFirst}
          endContent={<MenuHint shortcut={SHORTCUTS.first} />}
        />
        <DropdownMenuItem
          label={t('item.previous')}
          onClick={actions.onPrevious}
          endContent={<MenuHint shortcut={SHORTCUTS.previous} />}
        />
        <DropdownMenuItem
          label={t('item.next')}
          onClick={actions.onNext}
          endContent={<MenuHint shortcut={SHORTCUTS.next} />}
        />
        <DropdownMenuItem
          label={t('item.last')}
          onClick={actions.onLast}
          endContent={<MenuHint shortcut={SHORTCUTS.last} />}
        />
        <DropdownMenuDivider />
        <DropdownMenuItem
          label={t('item.goToPage')}
          onClick={onOpenGoToPage}
          isDisabled={onOpenGoToPage === undefined}
        />
        <DropdownMenuDivider />
        <DropdownMenuItem
          label={t('item.nextBookmark')}
          onClick={() => actions.onStepBookmark(1)}
          endContent={<MenuHint shortcut={SHORTCUTS.nextBookmark} />}
        />
        <DropdownMenuItem
          label={t('item.previousBookmark')}
          onClick={() => actions.onStepBookmark(-1)}
          endContent={<MenuHint shortcut={SHORTCUTS.previousBookmark} />}
        />
      </Menu>

      <Menu id="play" label={t('menu.play')} openMenu={openMenu} onOpenChange={changeOpen}>
        <DropdownMenuItem
          label={state.isPlaying ? t('item.stopSlideshow') : t('item.startSlideshow')}
          onClick={actions.onToggleSlideshow}
          endContent={<MenuHint shortcut={SHORTCUTS.slideshow} />}
        />
      </Menu>

      <Menu id="settings" label={t('menu.settings')} openMenu={openMenu} onOpenChange={changeOpen}>
        <DropdownMenuItem
          label={t('item.readingSettings')}
          onClick={actions.onToggleSettings}
          endContent={<MenuHint shortcut={SHORTCUTS.settings} />}
        />
      </Menu>
    </HStack>
  )
}
