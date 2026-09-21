/**
 * 책장. 들여온 책을 늘어놓고, 들여오고, 지우고, 리더로 보낸다.
 *
 * Foldkit의 `view/shelf.ts`를 옮긴 것이다. 규칙은 그대로다 — 읽는 중과 빈 책장은 다른
 * 화면이고(`S-101`), 카드 전체가 그 책으로 가는 링크이며(`S-104`), 🗑은 지우는 것이
 * 아니라 묻는 버튼이다(`S-131`).
 *
 * 머리는 Astryx `TopNav`, 지울지 묻는 것은 `AlertDialog`다. Astryx 이관 안내가 앱의 틀과
 * 되돌릴 수 없는 확인을 그 둘에 맡기라고 한다.
 *
 * 상태는 모두 atom에 있다(`shelfAtoms.ts`). 책과 표지뿐 아니라 물음이 어느 카드에 서
 * 있는지·상태 줄이 무엇을 말하는지·설정 패널이 열렸는지도 그렇다. 이 컴포넌트가 쥐는 것은
 * 드래그가 책장 위에 올라와 있는지 하나뿐이다 — 강조 표시를 위한 것이고, 떨어뜨리는 순간
 * 사라진다.
 */

import * as stylex from '@stylexjs/stylex'
import { Effect, Option } from 'effect'
import { AsyncResult } from 'effect/unstable/reactivity'
import { useAtom, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { DragEvent } from 'react'

import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Text } from '@astryxdesign/core/Text'
import {
  colorVars,
  durationVars,
  easeVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from '@astryxdesign/core/theme/tokens.stylex'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden'
import { VStack } from '@astryxdesign/core/VStack'

import {
  applyAndSaveTheme,
  coverUrlAtom,
  deleteBookAtom,
  importFilesAtom,
  noticeAtom,
  noticeLingerAtom,
  pendingDeleteAtom,
  pickFiles,
  pickFolder,
  shelfAtom,
  shelfSettingsOpenAtom,
  themeAtom,
} from './shelfAtoms.ts'
import type { ShelfBook } from './shelfAtoms.ts'
import type { Theme } from '../types.ts'
import { nudgedSlideSeconds, nudgedThreshold } from '../settings.ts'
import { SettingsPanel } from './settings/index.ts'
import type { Translate } from './i18n/format.ts'
import { useChooseLocale } from './i18n/atoms.ts'
import { useMessages } from './i18n/messages.ts'
import { useDocumentTitle } from './title.ts'
import { settingsAtom } from './state/index.ts'

/** 토글은 지금 있는 곳이 아니라 데려갈 곳을 말한다(`S-141`). */
const themeToggleLabel = (theme: Theme, t: Translate): string =>
  theme === 'dark' ? t('shelf.toLightTheme') : t('shelf.toDarkTheme')

/**
 * 책장 화면의 모양.
 *
 * 크기와 색은 모두 Astryx 토큰에서 온다. 숫자로 박은 것은 격자 칸의 최소 너비와 표지 비율뿐인데,
 * 둘은 테마가 아니라 책의 모양에서 나온 값이다.
 */
const styles = stylex.create({
  screen: {
    position: 'relative',
  },
  notice: {
    paddingInline: spacingVars['--spacing-6'],
    paddingTop: spacingVars['--spacing-4'],
    fontSize: textSizeVars['--font-size-base'],
    color: colorVars['--color-text-secondary'],
  },
  noticeFailed: {
    color: colorVars['--color-text-red'],
  },
  dropZone: {
    display: 'flex',
    flex: '1',
    flexDirection: 'column',
    overflowY: 'auto',
    margin: spacingVars['--spacing-4'],
    padding: spacingVars['--spacing-4'],
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'transparent',
    borderRadius: radiusVars['--radius-container'],
    transitionProperty: 'border-color, background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  dropZoneOver: {
    borderColor: colorVars['--color-accent'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-accent']} 5%, transparent)`,
  },
  placeholder: {
    margin: 'auto',
  },
  grid: {
    display: 'grid',
    // 칸은 표지가 읽힐 만큼은 넓어야 하고, 남는 폭은 칸들이 고르게 나눠 가진다.
    gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))',
    alignContent: 'start',
    gap: spacingVars['--spacing-5'],
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  card: {
    position: 'relative',
  },
  cardLink: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-element'],
    color: 'inherit',
    textDecoration: 'none',
    transform: {
      default: null,
      '@media (hover: hover)': { ':hover': 'translateY(-2px)' },
    },
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    outlineStyle: { default: 'none', ':focus-visible': 'solid' },
    outlineWidth: 2,
    outlineOffset: 2,
    outlineColor: colorVars['--color-accent'],
  },
  cover: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    aspectRatio: '2 / 3',
    objectFit: 'cover',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-gray'],
    fontSize: textSizeVars['--font-size-3xl'],
  },
  title: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    fontSize: textSizeVars['--font-size-base'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  bin: {
    position: 'absolute',
    top: spacingVars['--spacing-2'],
    right: spacingVars['--spacing-2'],
    // 평소에는 숨었다가 카드에 손이 오거나 포커스가 카드 안에 들어오면 선다(`S-131`).
    opacity: {
      default: 0,
      '@media (hover: hover)': { [stylex.when.ancestor(':hover')]: 1 },
      [stylex.when.ancestor(':focus-within')]: 1,
    },
    transitionProperty: 'opacity',
    transitionDuration: durationVars['--duration-fast'],
  },
})

const Cover = ({ bookId }: Readonly<{ bookId: string }>) => {
  const maybeUrl = Option.flatten(AsyncResult.value(useAtomValue(coverUrlAtom(bookId))))

  return Option.match(maybeUrl, {
    onNone: () => (
      <div aria-hidden={true} {...stylex.props(styles.cover)}>
        📖
      </div>
    ),
    onSome: (url) => <img alt="" src={url} loading="lazy" {...stylex.props(styles.cover)} />,
  })
}

/**
 * 지울지 묻는 대화상자(`S-131`). 묻는 책이 없으면 닫혀 있다.
 *
 * 되돌릴 수 없는 일이라 모달로 묻는다. 열려 있는 동안 책장의 나머지는 닿지 않으므로, 한 번에
 * 한 권만 묻고 답하기 전에는 그 책으로 들어갈 수도 없다. 처음 포커스는 지키는 쪽에 가고,
 * Escape와 바깥 누르기는 지키는 것이다.
 *
 * 지우는 동안에는 닫지 않는다. 버튼에 진행 표시를 두고, 지우기가 끝나면 — 실패했더라도 —
 * 그때 닫는다. 실패는 상태 줄이 말한다(`S-133`).
 */
const ConfirmDelete = ({
  maybeBook,
  isDeleting,
  onConfirm,
  onCancel,
}: Readonly<{
  maybeBook: ShelfBook | null
  isDeleting: boolean
  onConfirm: (book: ShelfBook) => void
  onCancel: () => void
}>) => {
  const t = useMessages()

  return (
    <AlertDialog
      isOpen={maybeBook !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isDeleting) onCancel()
      }}
      title={t('shelf.removeTitle', { title: maybeBook?.title ?? '' })}
      description={t('shelf.removeBody')}
      actionLabel={t('shelf.remove')}
      cancelLabel={t('shelf.keep')}
      isActionLoading={isDeleting}
      onAction={() => {
        if (maybeBook !== null) onConfirm(maybeBook)
      }}
    />
  )
}

/**
 * 책 한 권의 카드. 누르면 리더로 간다(`S-104`).
 *
 * 링크의 접근 가능한 이름은 `aria-label`의 제목이다. 🗑은 그 이름에 섞이지 않게 링크의
 * 형제로 둔다.
 */
const Card = ({ book, onAsk }: Readonly<{ book: ShelfBook; onAsk: () => void }>) => (
  // 카드가 🗑의 조상 표지다. 🗑은 카드에 손이 오거나 포커스가 들어올 때 선다.
  <li {...stylex.props(stylex.defaultMarker(), styles.card)}>
    <Link
      to="/book/$id"
      params={{ id: book.id }}
      aria-label={book.title}
      {...stylex.props(styles.cardLink)}
    >
      <Cover bookId={book.id} />
      <span title={book.title} {...stylex.props(styles.title)}>
        {book.title}
      </span>
      <Text size="sm" color="secondary">
        {book.countLabel}
      </Text>
    </Link>
    <div {...stylex.props(styles.bin)}>
      <Button
        label={useMessages()('shelf.removeBook', { title: book.title })}
        icon={<span aria-hidden={true}>🗑</span>}
        isIconOnly={true}
        variant="ghost"
        size="sm"
        onClick={onAsk}
      />
    </div>
  </li>
)

const Empty = () => {
  const t = useMessages()

  return (
    <EmptyState
      title={t('shelf.emptyTitle')}
      description={t('shelf.emptyBody')}
      xstyle={styles.placeholder}
    />
  )
}

const Placeholder = ({ text }: Readonly<{ text: string }>) => (
  <div {...stylex.props(styles.placeholder)}>
    <Text color="secondary">{text}</Text>
  </div>
)

/** 책장을 그린다. 헤더, 상태 줄, 그리고 임포트를 받는 드롭 존 안의 책 격자. */
export const ShelfScreen = () => {
  const t = useMessages()
  const chooseLocale = useChooseLocale()
  const shelf = useAtomValue(shelfAtom)
  const [theme, setTheme] = useAtom(themeAtom)
  const [settings, setSettings] = useAtom(settingsAtom)
  useDocumentTitle('comicyuri')
  const runImport = useAtomSet(importFilesAtom, { mode: 'promise' })
  const runDelete = useAtomSet(deleteBookAtom, { mode: 'promise' })
  const isDeleting = AsyncResult.isWaiting(useAtomValue(deleteBookAtom))

  const [notice, setNotice] = useAtom(noticeAtom)
  useAtomMount(noticeLingerAtom)
  const [maybePendingDelete, setPendingDelete] = useAtom(pendingDeleteAtom)
  const [isSettingsOpen, setIsSettingsOpen] = useAtom(shelfSettingsOpenAtom)
  const [isDragOver, setIsDragOver] = useState(false)

  /** 고른 파일을 들여온다. 아무것도 고르지 않은 것은 아무 일도 아니다(`S-118`). */
  const importFiles = async (files: ReadonlyArray<File>) => {
    if (files.length === 0) return

    setNotice({ tone: 'busy', text: t('shelf.importing') })
    const maybeError = await runImport(files)
    setNotice((standing) =>
      Option.match(maybeError, {
        // 끝난 작업은 자기가 세운 대기만 거둔다. 도는 동안 실패가 들어왔다면 그것은
        // 아직 제 4초를 다 쓰지 않았으므로 그대로 둔다(`F-503`).
        onNone: () => (standing?.tone === 'failed' ? standing : null),
        onSome: (text) => ({ tone: 'failed', text }),
      }),
    )
  }

  const pick = (picker: Effect.Effect<ReadonlyArray<File>>) => {
    void Effect.runPromise(picker).then(importFiles)
  }

  const confirmDelete = async (book: ShelfBook) => {
    const maybeError = await runDelete(book.id)
    setPendingDelete(null)
    if (Option.isSome(maybeError)) setNotice({ tone: 'failed', text: maybeError.value })
  }

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    void Effect.runPromise(applyAndSaveTheme(next))
  }

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragOver(false)

    const files = event.dataTransfer ? [...event.dataTransfer.files] : []
    if (files.length === 0) {
      setNotice({ tone: 'failed', text: t('shelf.onlyFiles') })
      return
    }

    void importFiles(files)
  }

  const maybeBooks = AsyncResult.value(shelf)
  const maybeError = AsyncResult.error(shelf)

  return (
    <VStack height="100%" xstyle={styles.screen}>
      {/*
        화면의 제목은 보이지 않게 둔다. `TopNavHeading`은 제목을 `div` 안의 글자로만 그려
        `h1`로 감쌀 수 없는데, 책장에 제목 수준의 헤딩이 없으면 보조기기로 화면을 훑는 길이
        하나 사라진다.
      */}
      <VisuallyHidden as="h1">comicyuri</VisuallyHidden>
      <TopNav
        label="comicyuri"
        heading={<TopNavHeading heading="comicyuri" />}
        endContent={
          <>
            <Button
              label={t('shelf.openFiles')}
              variant="primary"
              onClick={() => pick(pickFiles)}
            />
            <Button label={t('shelf.openFolder')} onClick={() => pick(pickFolder)} />
            <Button
              label={themeToggleLabel(theme, t)}
              tooltip={themeToggleLabel(theme, t)}
              icon={<span aria-hidden={true}>◐</span>}
              isIconOnly={true}
              variant="ghost"
              onClick={toggleTheme}
            />
            {/* 설정 패널로 들어가는 문(`R-2B6`). 패널은 리더의 것과 한 벌이다. */}
            <Button
              label={t('shelf.readingSettings')}
              icon={<span aria-hidden={true}>⚙</span>}
              isIconOnly={true}
              variant="ghost"
              aria-expanded={isSettingsOpen}
              onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
            />
          </>
        }
      />
      <ConfirmDelete
        maybeBook={maybePendingDelete}
        isDeleting={isDeleting}
        onConfirm={(book) => void confirmDelete(book)}
        onCancel={() => setPendingDelete(null)}
      />
      {/*
        책장에서 정하는 것은 전역 기본값이다(`R-2B6`). 책이 없으니 이 책의 것과 가를
        일도 없고, 여기서 바꾼 것이 그대로 다음에 여는 책들의 기본값이 된다.
      */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onToggleCoverAlone={(isChecked) => setSettings({ ...settings, coverAlone: isChecked })}
        onToggleSplitWide={(isChecked) => setSettings({ ...settings, splitWide: isChecked })}
        onToggleEnlargeToFit={(isChecked) => setSettings({ ...settings, enlargeToFit: isChecked })}
        onToggleRememberBookSettings={(isChecked) =>
          setSettings({ ...settings, rememberBookSettings: isChecked })
        }
        onNudgeThreshold={(by) =>
          setSettings({
            ...settings,
            singleThreshold: nudgedThreshold(settings.singleThreshold, by),
          })
        }
        onNudgeSlideSeconds={(by) =>
          setSettings({ ...settings, slideSeconds: nudgedSlideSeconds(settings.slideSeconds, by) })
        }
        onSelectAtBookEnd={(atBookEnd) => setSettings({ ...settings, atBookEnd })}
        onSelectResume={(resume) => setSettings({ ...settings, resume })}
        onSelectLocale={(locale) => {
          setSettings({ ...settings, locale })
          chooseLocale(locale)
        }}
      />
      {/*
        할 말이 생기기 전에 live region이 이미 있도록, 할 말이 없을 때도 빈 채로 그려
        둔다. 문구와 함께 만들어진 region은 읽히지 않는다.
      */}
      <p
        role="status"
        aria-live="polite"
        {...stylex.props(styles.notice, notice?.tone === 'failed' && styles.noticeFailed)}
      >
        {notice === null
          ? ''
          : notice.tone === 'failed'
            ? t('shelf.actionFailed', { text: notice.text })
            : notice.text}
      </p>
      {/*
        드롭 영역은 책장 전체다(`S-111`). 그 안에는 어떤 입력 요소도 두지 않는다 —
        드롭 존이 페이지 전체라서 `label`을 두면 책을 누를 때마다 선택기가 열린다.
        파일 고르기는 헤더 버튼이 맡는다.
      */}
      <main
        aria-label={t('shelf.region')}
        data-drag-over={isDragOver ? '' : undefined}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={(event) => {
          // 드롭 존 안쪽 요소로 옮겨 간 것은 떠난 것이 아니다. 그러지 않으면 카드
          // 위를 지날 때마다 테두리가 깜빡인다.
          const related = event.relatedTarget
          if (!(related instanceof Node) || !event.currentTarget.contains(related)) {
            setIsDragOver(false)
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        {...stylex.props(styles.dropZone, isDragOver && styles.dropZoneOver)}
      >
        {Option.match(maybeBooks, {
          onNone: () =>
            Option.match(maybeError, {
              onNone: () => <Placeholder text={t('shelf.opening')} />,
              onSome: (text) => <Placeholder text={t('shelf.openFailed', { text })} />,
            }),
          onSome: (books) =>
            books.length === 0 ? (
              <Empty />
            ) : (
              <ul {...stylex.props(styles.grid)}>
                {books.map((book) => (
                  <Card key={book.id} book={book} onAsk={() => setPendingDelete(book)} />
                ))}
              </ul>
            ),
        })}
      </main>
    </VStack>
  )
}
