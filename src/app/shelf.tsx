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

import { Effect, Option } from 'effect'
import { AsyncResult } from 'effect/unstable/reactivity'
import { useAtom, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { DragEvent } from 'react'

import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden'

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
import { useDocumentTitle } from './title.ts'
import { settingsAtom } from './state/index.ts'

/** 토글은 지금 있는 곳이 아니라 데려갈 곳을 말한다(`S-141`). */
const themeToggleLabel = (theme: Theme): string =>
  theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

/** 카드 모서리 버튼과 묻는 자리 버튼의 겉모습. */
const cornerButtonClassName = 'text-xs'

const Cover = ({ bookId }: Readonly<{ bookId: string }>) => {
  const maybeUrl = Option.flatten(AsyncResult.value(useAtomValue(coverUrlAtom(bookId))))

  return Option.match(maybeUrl, {
    onNone: () => (
      <div
        aria-hidden={true}
        className="flex aspect-2/3 items-center justify-center rounded-lg bg-surface-2 text-3xl"
      >
        📖
      </div>
    ),
    onSome: (url) => (
      <img
        alt=""
        src={url}
        loading="lazy"
        className="aspect-2/3 w-full rounded-lg bg-surface-2 object-cover"
      />
    ),
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
}>) => (
  <AlertDialog
    isOpen={maybeBook !== null}
    onOpenChange={(isOpen) => {
      if (!isOpen && !isDeleting) onCancel()
    }}
    title={`Remove ${maybeBook?.title ?? ''}?`}
    description="The book and where you left off in it are removed from this browser. This can't be undone."
    actionLabel="Remove"
    cancelLabel="Keep"
    isActionLoading={isDeleting}
    onAction={() => {
      if (maybeBook !== null) onConfirm(maybeBook)
    }}
  />
)

/**
 * 책 한 권의 카드. 누르면 리더로 간다(`S-104`).
 *
 * 링크의 접근 가능한 이름은 `aria-label`의 제목이다. 🗑은 그 이름에 섞이지 않게 링크의
 * 형제로 둔다.
 */
const Card = ({ book, onAsk }: Readonly<{ book: ShelfBook; onAsk: () => void }>) => (
  <li className="group relative">
    <Link
      to="/book/$id"
      params={{ id: book.id }}
      aria-label={book.title}
      className="flex flex-col gap-2 rounded-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Cover bookId={book.id} />
      <span className="truncate text-sm font-medium" title={book.title}>
        {book.title}
      </span>
      <span className="text-xs text-muted">{book.countLabel}</span>
    </Link>
    <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <Button
        label={`Remove ${book.title} from shelf…`}
        icon={<span aria-hidden={true}>🗑</span>}
        isIconOnly={true}
        variant="ghost"
        size="sm"
        className={cornerButtonClassName}
        onClick={onAsk}
      />
    </div>
  </li>
)

const Empty = () => (
  <div className="m-auto max-w-md text-center">
    <p className="text-lg font-medium">Your shelf is empty</p>
    <p className="mt-2 text-sm text-muted">
      Open <strong className="text-ink">.cbz / .zip</strong> archives, image files, or a folder — or
      drop them here.
    </p>
    <p className="mt-4 text-xs text-muted">
      Files stay in your browser, and the shelf survives a reload.
    </p>
  </div>
)

const Placeholder = ({ text }: Readonly<{ text: string }>) => (
  <p className="m-auto text-sm text-muted">{text}</p>
)

/** 책장을 그린다. 헤더, 상태 줄, 그리고 임포트를 받는 드롭 존 안의 책 격자. */
export const ShelfScreen = () => {
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

    setNotice({ tone: 'busy', text: 'Importing…' })
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
      setNotice({ tone: 'failed', text: 'Only files can be dropped here' })
      return
    }

    void importFiles(files)
  }

  const maybeBooks = AsyncResult.value(shelf)
  const maybeError = AsyncResult.error(shelf)

  return (
    <div className="relative flex h-full flex-col">
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
            <Button label="Open files" variant="primary" onClick={() => pick(pickFiles)} />
            <Button label="Open folder" onClick={() => pick(pickFolder)} />
            <Button
              label={themeToggleLabel(theme)}
              tooltip={themeToggleLabel(theme)}
              icon={<span aria-hidden={true}>◐</span>}
              isIconOnly={true}
              variant="ghost"
              onClick={toggleTheme}
            />
            {/* 설정 패널로 들어가는 문(`R-2B6`). 패널은 리더의 것과 한 벌이다. */}
            <Button
              label="Reading settings"
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
      />
      {/*
        할 말이 생기기 전에 live region이 이미 있도록, 할 말이 없을 때도 빈 채로 그려
        둔다. 문구와 함께 만들어진 region은 읽히지 않는다.
      */}
      <p
        role="status"
        aria-live="polite"
        className={`px-6 pt-4 text-sm ${notice?.tone === 'failed' ? 'text-danger' : 'text-muted'}`}
      >
        {notice === null
          ? ''
          : notice.tone === 'failed'
            ? `Couldn't do that — ${notice.text}`
            : notice.text}
      </p>
      {/*
        드롭 영역은 책장 전체다(`S-111`). 그 안에는 어떤 입력 요소도 두지 않는다 —
        드롭 존이 페이지 전체라서 `label`을 두면 책을 누를 때마다 선택기가 열린다.
        파일 고르기는 헤더 버튼이 맡는다.
      */}
      <main
        aria-label="Shelf"
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
        className="m-4 flex flex-1 flex-col overflow-y-auto rounded-xl border-2 border-dashed border-transparent p-4 transition-colors data-drag-over:border-accent data-drag-over:bg-accent/5"
      >
        {Option.match(maybeBooks, {
          onNone: () =>
            Option.match(maybeError, {
              onNone: () => <Placeholder text="Opening your shelf…" />,
              onSome: (text) => <Placeholder text={`Couldn't open your shelf — ${text}`} />,
            }),
          onSome: (books) =>
            books.length === 0 ? (
              <Empty />
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] content-start gap-5">
                {books.map((book) => (
                  <Card key={book.id} book={book} onAsk={() => setPendingDelete(book)} />
                ))}
              </ul>
            ),
        })}
      </main>
    </div>
  )
}
