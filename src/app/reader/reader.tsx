/**
 * 리더 화면. 지금까지 따로 서 있던 조각들을 한 화면으로 붙이는 자리다.
 *
 * Model 하나를 atom에 담고 순수한 `update`로만 바꾼다(`src/reader/atom.ts`). 스프레드를
 * 부르는 일은 페이지 atom이, 크롬과 설정과 격자는 각자의 컴포넌트가 맡으므로, 여기 남은
 * 것은 셋을 잇는 일이다 — Model에서 그릴 값을 뽑아 내려보내고, 콜백이 부르면 Message를
 * 접어 넣고, update가 남긴 Command와 OutMessage를 실제로 푼다.
 *
 * Foldkit 리더의 `view`·`subscriptions`·애플리케이션의 `foldReaderOutMessage`가 하던 일이
 * 모두 이 파일과 이웃한 훅들에 들어 있다.
 */

// oxlint-disable foldkit/no-child-message-construction-in-root
/*
 * 위의 한 줄에 대하여.
 *
 * 이 규칙은 Foldkit의 부모-자식 Submodel 관계를 지키는 것이다. 부모가 자식의 Message를
 * 지어 보내면 자식의 update를 건너뛰게 되므로, `Update.foldChild`로 들어가라고 말한다.
 *
 * 여기에는 그 부모가 없다. 리더의 Model을 쥔 것은 이 화면이고, 그것을 바꾸는 유일한 길이
 * `dispatch`를 통한 리더 자신의 `update`다 — 규칙이 지키려는 것이 이미 지켜져 있다.
 * 규칙이 걸리는 까닭은 Message가 `src/reader/message.ts`에 있어서 이 파일에서 보면 이웃이
 * 아닌 모듈로 보이기 때문이지, 남의 Message를 지어서가 아니다.
 *
 * Foldkit과 이 플러그인이 저장소에서 사라지면 이 줄도 함께 사라진다(`MIGRATION.md`).
 */

import { Array, Cause, Effect, Option } from 'effect'
import { AsyncResult } from 'effect/unstable/reactivity'
import { RegistryContext, useAtomMount, useAtomValue } from '@effect/atom-react'
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react'

import { pageAtoms } from '../../atoms/browser.ts'
import type { PageAtoms } from '../../atoms/pages.ts'
import { Reading } from '../../domain/index.ts'
import { describe } from '../../errors.ts'
import type { AppError } from '../../errors.ts'
import { dispatch, makeReaderAtom } from '../../reader/atom.ts'
import type { ReaderAtom } from '../../reader/atom.ts'
import { Message, OutMessage } from '../../reader/message.ts'
import { OpenState, spreadPages } from '../../reader/model.ts'
import type { Model } from '../../reader/model.ts'
import { ReaderChrome } from '../chrome/index.ts'
import type { ChromeActions, ChromeState } from '../chrome/index.ts'
import { SettingsPanel } from '../settings/index.ts'
import { ThumbsPanel } from '../thumbs/index.ts'
import { runCommand, useReaderEvents, useSlideshow } from './events.ts'
import { counterLabel, fileNamesFor, readerLayout } from './layout.ts'
import { browserPersistence } from './persistence.ts'
import type { ReaderPersistence } from './persistence.ts'
import { ReaderStage } from './stage.tsx'
import { SpreadHold, useShownSpread } from './spread.tsx'

/**
 * 리더가 직접 세우는 버튼의 겉모습. 앱의 다른 버튼과 같은 색이어야 하므로 Astryx의
 * `Button`이 아니라 `styles.css`의 토큰을 쓴다.
 */
const controlClassName =
  'cursor-pointer rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** 책을 여는 동안과, 끝내 열지 못했을 때 서는 화면. */
const OpeningScreen = ({ text, onExit }: Readonly<{ text: string; onExit: () => void }>) => (
  <main className="flex h-full flex-col items-center justify-center gap-3 p-6">
    <p className="text-sm text-muted">{text}</p>
    <button type="button" className={controlClassName} onClick={onExit}>
      ← Shelf
    </button>
  </main>
)

/**
 * 저장된 자리로 갈지 묻는 줄(`R-2B5`).
 *
 * 크롬 바깥에 서므로 툴바를 숨겨도 남는다. 툴바와 함께 숨으면 답할 기회가 없어지고, 첫
 * 장부터 읽기 시작했다고 해서 그 자리가 사라지지도 않는다.
 */
const ResumeRow = ({
  page,
  onResume,
  onDismiss,
}: Readonly<{ page: number; onResume: () => void; onDismiss: () => void }>) => (
  <div
    role="status"
    className="flex flex-wrap items-center gap-2 border-b border-edge bg-surface-2 px-4 py-2 text-sm"
  >
    <span className="mr-auto text-muted">{`You left this book on page ${page + 1}`}</span>
    <button type="button" className={controlClassName} onClick={onResume}>
      Go there
    </button>
    <button
      type="button"
      aria-label="Stay on the first page"
      className={controlClassName}
      onClick={onDismiss}
    >
      Stay
    </button>
  </div>
)

/** 책을 열다 실패한 까닭을 한 줄로. */
const openFailureText = (cause: Cause.Cause<AppError>): string =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => 'Could not open the book',
    onSome: describe,
  })

/** 리더 화면이 받는 것. */
export type ReaderViewProps = Readonly<{
  /**
   * 세워 둔 첫 Model. 저장된 자리와 설정을 읽은 뒤에 만들어야 한다 — 첫 장을 그렸다가
   * 건너뛰는 일이 없도록(`R-2B5`).
   *
   * 한 번만 읽는다. 다른 책으로 갈아탈 때는 `key`로 이 컴포넌트를 새로 세운다.
   */
  initial: Model
  /** 책장으로 돌아간다. Escape가 마지막으로 벗기는 겹이다(`R-2A3`). */
  onExit: () => void
  /** 이웃한 책을 그 자리에서 연다(`R-216`). */
  onOpenBook: (bookId: string) => void
  /** 페이지를 뽑는 atom 한 벌. 시험에서만 갈아 끼운다. */
  pages?: PageAtoms
  /** 저장소에 닿는 길. 시험에서만 갈아 끼운다. */
  persistence?: ReaderPersistence
}>

/**
 * 리더를 그린다. 크롬, 이어 가기 줄, 스테이지, 그리고 열려 있다면 격자와 설정 패널이다.
 *
 * 숨긴 크롬은 흐리게 두지 않고 아예 그리지 않는다. 자리를 차지한 채 투명해지면 스테이지는
 * 그대로 작고, 숨기는 일이 읽을 자리를 넓히지 못한다(`R-252`).
 */
export const ReaderView = ({
  initial,
  onExit,
  onOpenBook,
  pages = pageAtoms,
  persistence = browserPersistence,
}: ReaderViewProps) => {
  const registry = useContext(RegistryContext)

  // Model을 담는 atom은 이 화면이 서 있는 동안 하나다. `initial`이 다시 와도 새로 세우지
  // 않는다 — 읽던 자리가 첫 Model로 되감기면 안 된다.
  const atomRef = useRef<ReaderAtom | null>(null)
  atomRef.current ??= makeReaderAtom(initial)
  const readerAtom = atomRef.current

  const model = useAtomValue(readerAtom)

  // Message를 보내는 길은 렌더마다 같은 함수여야 한다. 구독 훅이 그것을 의존성으로 삼고,
  // 바뀔 때마다 리스너를 다시 걸기 때문이다. 그래서 겉은 고정하고 속만 갈아 끼운다.
  const sendRef = useRef<(message: Message) => void>(() => undefined)
  const send = useCallback((message: Message): void => sendRef.current(message), [])

  const handleOut = (out: OutMessage): void =>
    OutMessage.$match(out, {
      RequestedExit: () => onExit(),

      /**
       * 책장 순서를 아는 것은 저장소다. 이웃한 책이 없으면 — 책장의 끝이라면 — 아무 일도
       * 일어나지 않고 리더는 제자리에 머문다.
       */
      RequestedNeighbourBook: ({ bookId, step }) => {
        void Effect.runPromise(persistence.neighbourBookId(bookId, step)).then((maybeId) => {
          if (Option.isSome(maybeId)) onOpenBook(maybeId.value)
        })
      },

      /**
       * 리더가 쥔 설정은 전역 기본값과 이 책의 것을 합친 결과다. 저장할 때 다시 갈라야,
       * 책마다 기억하기가 켜진 동안 어떤 책에서 뒤집은 방향이 전역 기본값이 되어 다음
       * 책까지 따라가지 않는다.
       */
      ChangedSettings: ({ bookId, settings }) => {
        const { global, maybeBook } = Reading.split(
          registry.get(persistence.settingsAtom),
          settings,
        )

        registry.set(persistence.settingsAtom, global)
        void Effect.runPromise(persistence.saveBookSettings(bookId, maybeBook))
      },

      UpdatedProgress: ({ bookId, page, bookmarks, marks, rotation }) => {
        void Effect.runPromise(
          persistence.saveProgress(bookId, { page, bookmarks, marks, rotation }),
        )
      },
    })

  sendRef.current = (message: Message): void => {
    const { commands, maybeOutMessage } = dispatch(registry, readerAtom, message)

    for (const command of commands) runCommand(command)
    if (Option.isSome(maybeOutMessage)) handleOut(maybeOutMessage.value)
  }

  // 책은 리더가 서 있는 동안 걸려 있다. 스프레드 사이의 틈에 다시 열지 않는다.
  const bookAtom = pages.book(model.bookId)
  useAtomMount(bookAtom)
  const book = useAtomValue(bookAtom)

  // 책이 열렸다는 것도, 열지 못했다는 것도 Message로 들어간다. atom의 답이 바뀌는 것이
  // 곧 그 한 번이므로, 같은 답에 두 번 보내지 않는다.
  useEffect(() => {
    if (AsyncResult.isSuccess(book)) {
      send(
        Message.CompletedOpenBook({
          title: book.value.title,
          pageCount: book.value.pages.length,
          ratios: book.value.pageSizes.map(Option.map(({ width, height }) => width / height)),
          names: book.value.pages.map((source) => source.name),
        }),
      )
    } else if (AsyncResult.isFailure(book)) {
      send(Message.FailedOpenBook({ text: openFailureText(book.cause) }))
    }
  }, [book, send])

  const maybeLayout = useMemo(() => readerLayout(model), [model])
  const here = spreadPages(model)
  const { maybeShown, isReady, maybeFailure } = useShownSpread(pages, model, here)

  useReaderEvents({ send, model, isSpreadReady: isReady })
  useSlideshow(send, model)

  return Option.match(maybeLayout, {
    onNone: () => (
      <OpeningScreen
        text={OpenState.$match(model.openState, {
          Opening: () => 'Opening…',
          Ready: () => 'Opening…',
          Failed: ({ text }) => text,
        })}
        onExit={() => send(Message.ClickedExit())}
      />
    ),

    onSome: (drawn) => {
      const state: ChromeState = {
        counter: counterLabel(drawn.here, drawn.pageCount),
        fileNames: fileNamesFor(drawn.here, drawn.names),
        page: model.page,
        pageCount: drawn.pageCount,
        direction: model.settings.direction,
        view: model.settings.view,
        fit: model.settings.fit,
        isBookmarked: Array.contains(model.bookmarks, model.page),
        isThumbsOpen: model.isThumbsOpen,
        isSettingsOpen: model.isSettingsOpen,
        isFullscreen: model.isFullscreen,
        isPlaying: model.isPlaying,
        isChromeVisible: model.isChromeVisible,
      }

      const actions: ChromeActions = {
        onExit: () => send(Message.ClickedExit()),
        onToggleBookmark: () => send(Message.ClickedToggleBookmark()),
        onToggleThumbs: () => send(Message.ClickedToggleThumbs()),
        onToggleSettings: () => send(Message.ClickedToggleSettings()),
        onToggleFullscreen: () => send(Message.ClickedToggleFullscreen()),
        onToggleChrome: () => send(Message.ClickedToggleChrome()),
        onToggleDirection: () => send(Message.ClickedToggleDirection()),
        onToggleView: () => send(Message.ClickedToggleView()),
        onCycleFit: () => send(Message.ClickedCycleFit()),
        onToggleBinding: () => send(Message.ClickedToggleBinding()),
        onToggleSlideshow: () => send(Message.ClickedToggleSlideshow()),
        onRotate: () => send(Message.ClickedRotate()),
        onZoomIn: () => send(Message.ClickedZoomIn()),
        onZoomOut: () => send(Message.ClickedZoomOut()),
        onFirst: () => send(Message.ClickedFirst()),
        onPrevious: () => send(Message.ClickedPrevious()),
        onNext: () => send(Message.ClickedNext()),
        onLast: () => send(Message.ClickedLast()),
        onStepBookmark: (step) => send(Message.ClickedStepBookmark({ step })),
        onSlide: (page) => send(Message.SelectedSliderPage({ page })),
        onGoToPage: (text) => send(Message.SubmittedGoToPage({ text })),
      }

      return (
        <main className="relative flex h-full flex-col" aria-label={drawn.title}>
          <ReaderChrome state={state} actions={actions}>
            {Option.match(model.maybeResumePage, {
              onNone: () => null,
              onSome: (page) => (
                <ResumeRow
                  page={page}
                  onResume={() => send(Message.ClickedResume({ page }))}
                  onDismiss={() => send(Message.ClickedDismissResume())}
                />
              ),
            })}
            <ReaderStage
              model={model}
              layout={drawn.layout}
              maybeShown={maybeShown}
              isLoading={!isReady}
              maybeFailure={maybeFailure}
            />
          </ReaderChrome>

          {/*
            다음 것이 설 때까지 남아 있는 스프레드와 양옆 이웃을 쥔다. 그리지는 않고
            구독만 하므로, 그 페이지들의 URL이 놓이지 않는다(`R-207`, `R-215`).
          */}
          {Option.match(maybeShown, {
            onNone: () => null,
            onSome: (shown) =>
              isReady ? null : (
                <SpreadHold pages={pages} bookId={model.bookId} spread={shown.pages} />
              ),
          })}
          {drawn.neighbours.map((spread) => (
            <SpreadHold
              key={spread.join(',')}
              pages={pages}
              bookId={model.bookId}
              spread={spread}
            />
          ))}

          {model.isThumbsOpen ? (
            <ThumbsPanel
              bookId={model.bookId}
              pageCount={drawn.pageCount}
              bookmarks={model.bookmarks}
              showsBookmarksOnly={model.showsBookmarksOnly}
              onSelect={(page) => send(Message.SelectedThumb({ page }))}
              onToggleBookmarksOnly={() => send(Message.ClickedToggleBookmarksOnly())}
              onRemoveBookmark={(page) => send(Message.ClickedRemoveBookmark({ page }))}
              onClose={() => send(Message.ClickedToggleThumbs())}
            />
          ) : null}

          <SettingsPanel
            isOpen={model.isSettingsOpen}
            settings={model.settings}
            onClose={() => send(Message.ClickedToggleSettings())}
            onToggleCoverAlone={(isChecked) => send(Message.ToggledCoverAlone({ isChecked }))}
            onToggleSplitWide={(isChecked) => send(Message.ToggledSplitWide({ isChecked }))}
            onToggleEnlargeToFit={(isChecked) => send(Message.ToggledEnlargeToFit({ isChecked }))}
            onToggleRememberBookSettings={(isChecked) =>
              send(Message.ToggledRememberBookSettings({ isChecked }))
            }
            onNudgeThreshold={(by) => send(Message.ClickedNudgeThreshold({ by }))}
            onNudgeSlideSeconds={(by) => send(Message.ClickedNudgeSlideSeconds({ by }))}
            onSelectAtBookEnd={(atBookEnd) => send(Message.SelectedAtBookEnd({ atBookEnd }))}
            onSelectResume={(resume) => send(Message.SelectedResume({ resume }))}
          />
        </main>
      )
    },
  })
}
