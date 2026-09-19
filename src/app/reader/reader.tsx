/**
 * 리더 화면. 지금까지 따로 서 있던 조각들을 한 화면으로 붙이는 자리다.
 *
 * 리더가 사는 곳은 세션이다(`session.ts`). Model, Message를 접어 넣는 길, 리더가 듣는
 * 것, 쥐고 있을 페이지가 모두 거기 atom으로 서 있다. 이 파일은 세션을 세워 마운트하고,
 * 거기서 읽은 값을 크롬·스테이지·격자·설정 패널에 내려보내고, 콜백을 Message로 바꿀
 * 뿐이다 — Foldkit 리더의 `view`에 해당한다.
 */

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

import * as stylex from '@stylexjs/stylex'
import { Array, Option } from 'effect'
import { useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react'
import { useState } from 'react'

import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { colorVars } from '@astryxdesign/core/theme/tokens.stylex'
import { VStack } from '@astryxdesign/core/VStack'

import { pageAtoms } from '../../atoms/browser.ts'
import type { PageAtoms } from '../../atoms/pages.ts'
import { Message } from '../../reader/message.ts'
import { OpenState } from '../../reader/model.ts'
import type { Model } from '../../reader/model.ts'
import { ReaderChrome } from '../chrome/index.ts'
import type { ChromeActions, ChromeState } from '../chrome/index.ts'
import { SettingsPanel } from '../settings/index.ts'
import { ThumbsPanel } from '../thumbs/index.ts'
import { counterLabel } from './layout.ts'
import { browserPersistence } from './persistence.ts'
import type { ReaderPersistence } from './persistence.ts'
import { makeReaderSession } from './session.ts'
import { ReaderStage } from './stage.tsx'

/**
 * 리더 화면의 틀과 이어 읽기 줄의 모양. 줄 세우기와 간격은 `HStack`·`VStack`이 맡는다.
 *
 * 격자 패널이 이 틀을 기준으로 덮으므로 틀이 `relative`다.
 */
const styles = stylex.create({
  reader: {
    position: 'relative',
  },
  resume: {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
    backgroundColor: colorVars['--color-background-gray'],
  },
  resumeText: {
    marginInlineEnd: 'auto',
  },
})

/** 책을 여는 동안과, 끝내 열지 못했을 때 서는 화면. */
const OpeningScreen = ({ text, onExit }: Readonly<{ text: string; onExit: () => void }>) => (
  <VStack as="main" align="center" justify="center" gap={3} padding={6} height="100%">
    <Text color="secondary">{text}</Text>
    <Button label="← Shelf" variant="secondary" onClick={onExit} />
  </VStack>
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
  <HStack
    role="status"
    wrap="wrap"
    align="center"
    gap={2}
    paddingInline={4}
    paddingBlock={2}
    xstyle={styles.resume}
  >
    <span {...stylex.props(styles.resumeText)}>
      <Text color="secondary">{`You left this book on page ${page + 1}`}</Text>
    </span>
    <Button label="Go there" variant="secondary" size="sm" onClick={onResume} />
    {/* 보이는 글자는 짧게, 이름은 무엇을 하는지 끝까지 말한다. */}
    <Button label="Stay on the first page" variant="secondary" size="sm" onClick={onDismiss}>
      Stay
    </Button>
  </HStack>
)

/** 리더 화면이 받는 것. */
export type ReaderViewProps = Readonly<{
  /**
   * 세워 둔 첫 Model. 저장된 자리와 설정을 읽은 뒤에 만들어야 한다 — 첫 장을 그렸다가
   * 건너뛰는 일이 없도록(`R-2B5`).
   *
   * 한 번만 읽는다. 다른 책으로 갈아탈 때는 `key`로 이 컴포넌트를 새로 세운다.
   */
  initial: Model
  /**
   * 책장으로 돌아간다. Escape가 마지막으로 벗기는 겹이다(`R-2A3`).
   *
   * `initial`과 같이 처음 받은 것을 세션이 쥔다.
   */
  onExit: () => void
  /** 이웃한 책을 그 자리에서 연다(`R-216`). 처음 받은 것을 세션이 쥔다. */
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
  // 세션은 이 화면이 서 있는 동안 하나다. `initial`이 다시 와도 새로 세우지 않는다 — 읽던
  // 자리가 첫 Model로 되감기면 안 된다. 다른 책으로 갈아탈 때는 `key`가 화면째 새로 세운다.
  const [session] = useState(() =>
    makeReaderSession({ initial, pages, persistence, onExit, onOpenBook }),
  )
  useAtomMount(session.runtime)

  const model = useAtomValue(session.model)
  const maybeLayout = useAtomValue(session.layout)
  const { maybeShown, isReady, maybeFailure } = useAtomValue(session.shown)
  const send = useAtomSet(session.send)

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
        page: model.page,
        pageCount: drawn.pageCount,
        direction: model.settings.direction,
        view: model.settings.view,
        fit: model.settings.fit,
        isBookmarked: Array.contains(model.bookmarks, model.page),
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
        onChooseDirection: (direction) => send(Message.ChoseDirection({ direction })),
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
        <VStack as="main" aria-label={drawn.title} height="100%" xstyle={styles.reader}>
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
        </VStack>
      )
    },
  })
}
