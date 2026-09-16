/**
 * 책장. 들여온 책을 늘어놓고, 들여오고, 지우고, 리더로 보낸다.
 *
 * Foldkit의 `view/shelf.ts`를 옮긴 것이다. 규칙은 그대로다 — 읽는 중과 빈 책장은 다른
 * 화면이고(`S-101`), 카드 전체가 그 책으로 가는 링크이며(`S-104`), 🗑은 지우는 것이
 * 아니라 묻는 버튼이다(`S-131`).
 *
 * 상태를 두는 자리가 달라졌다. 책과 표지는 atom이 맡고(`shelfAtoms.ts`), 물음이 어느
 * 카드에 서 있는지·상태 줄이 무엇을 말하는지·설정 패널이 열렸는지 같은 화면 순간의
 * 것은 이 컴포넌트가 쥔다.
 */

import { Effect, Option } from 'effect'
import { AsyncResult } from 'effect/unstable/reactivity'
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { DragEvent } from 'react'

import { Button } from '@astryxdesign/core/Button'

import {
  applyAndSaveTheme,
  coverUrlAtom,
  deleteBookAtom,
  importFilesAtom,
  pickFiles,
  pickFolder,
  shelfAtom,
  themeAtom,
} from './shelfAtoms.ts'
import type { ShelfBook } from './shelfAtoms.ts'
import type { Theme } from '../types.ts'
import { nudgedSlideSeconds, nudgedThreshold } from '../settings.ts'
import { SettingsPanel } from './settings/index.ts'
import { useDocumentTitle } from './title.ts'
import { settingsAtom } from './state/index.ts'

/** 실패가 상태 줄에 머무르다 스스로 사라지기까지의 시간(밀리초). */
const NOTICE_LINGER_MS = 4000

/**
 * 사람이 시작한 작업에 대해 상태 줄이 하는 말. 책장 자체의 읽기 상태와는 다르며,
 * 그쪽은 {@linkcode shelfAtom}에 있다.
 */
type Notice = Readonly<{ tone: 'busy' | 'failed'; text: string }>

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
 * 지울지 묻는 자리. 카드 위에 덮이고 링크는 `inert`가 되어, 답하기 전에는 포인터로도
 * 키보드로도 그 카드에 들어갈 수 없다(`S-131`).
 *
 * 물음과 답을 같은 자리에 두지 않는다. 🗑이 있던 곳에 "Remove"가 서면 두 번째
 * 누름이 첫 번째와 같은 동작처럼 보이고, 그 자리는 손이 이미 가 있는 자리다.
 */
const ConfirmDelete = ({
  book,
  onConfirm,
  onCancel,
}: Readonly<{ book: ShelfBook; onConfirm: () => void; onCancel: () => void }>) => (
  <div
    role="group"
    aria-label={`Remove ${book.title}?`}
    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-bg/90 p-2 text-center backdrop-blur-sm"
  >
    <p className="text-xs text-muted">Remove this book and where you left off?</p>
    <div className="flex gap-2">
      <Button
        label={`Remove ${book.title} from shelf`}
        variant="ghost"
        size="sm"
        className={`${cornerButtonClassName} text-danger`}
        onClick={onConfirm}
      >
        Remove
      </Button>
      <Button
        label={`Keep ${book.title}`}
        variant="ghost"
        size="sm"
        className={cornerButtonClassName}
        onClick={onCancel}
      >
        Keep
      </Button>
    </div>
  </div>
)

/**
 * 책 한 권의 카드. 누르면 리더로 간다(`S-104`).
 *
 * 링크의 접근 가능한 이름은 `aria-label`의 제목이다. 🗑과 묻는 자리는 그 이름에
 * 섞이지 않게 링크의 형제로 둔다.
 *
 * 묻는 동안에는 링크를 `inert`로 둔다. 물음이 카드를 덮어 포인터는 막지만, Tab으로
 * 링크에 가서 Enter를 누르는 길은 덮개가 막지 못한다.
 */
const Card = ({
  book,
  isPendingDelete,
  onAsk,
  onConfirm,
  onCancel,
}: Readonly<{
  book: ShelfBook
  isPendingDelete: boolean
  onAsk: () => void
  onConfirm: () => void
  onCancel: () => void
}>) => (
  <li className="group relative">
    <Link
      to="/book/$id"
      params={{ id: book.id }}
      aria-label={book.title}
      inert={isPendingDelete}
      className="flex flex-col gap-2 rounded-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Cover bookId={book.id} />
      <span className="truncate text-sm font-medium" title={book.title}>
        {book.title}
      </span>
      <span className="text-xs text-muted">{book.countLabel}</span>
    </Link>
    {isPendingDelete ? (
      <ConfirmDelete book={book} onConfirm={onConfirm} onCancel={onCancel} />
    ) : (
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
    )}
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

  const [notice, setNotice] = useState<Notice | null>(null)
  const [maybePendingDelete, setPendingDelete] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  // 실패는 스스로 사라진다. 새 실패는 새 객체라 앞선 대기가 정리되므로, 뒤의 실패가
  // 앞선 대기에 잘려 나가지 않는다.
  useEffect(() => {
    if (notice?.tone !== 'failed') return
    const timer = setTimeout(() => setNotice(null), NOTICE_LINGER_MS)
    return () => clearTimeout(timer)
  }, [notice])

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

  const confirmDelete = async (id: string) => {
    setPendingDelete(null)
    const maybeError = await runDelete(id)
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
      <header className="flex flex-wrap items-center gap-3 border-b border-edge px-6 py-4">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">
          comic<span className="text-accent">yuri</span>
        </h1>
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
      </header>
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
                  <Card
                    key={book.id}
                    book={book}
                    isPendingDelete={maybePendingDelete === book.id}
                    onAsk={() => setPendingDelete(book.id)}
                    onConfirm={() => void confirmDelete(book.id)}
                    onCancel={() => setPendingDelete(null)}
                  />
                ))}
              </ul>
            ),
        })}
      </main>
    </div>
  )
}
