/**
 * 읽는 규칙을 한 번 정해 두는 패널. 리더와 책장이 같은 것을 연다.
 *
 * 여기 있는 값은 모두 전역 기본값이다. 리더에서 열면 그 책에 걸린 것까지 합친
 * 결과를 보여 주고(`R-2B3`), 책장에서 열면 기본값 그대로다. 어느 쪽에서 열어도
 * 같은 항목이 같은 순서로 서야 하므로 뷰는 한 벌만 둔다.
 *
 * 메시지는 부르는 쪽이 넘긴다. 리더의 Message와 애플리케이션의 Message가 서로
 * 다른 타입이라, 그것을 여기서 고르면 한쪽에서만 쓸 수 있는 패널이 된다.
 */

import { Array } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Switch } from '@foldkit/ui'

import {
  SLIDE_MAX,
  SLIDE_MIN,
  SLIDE_STEP,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  THRESHOLD_STEP,
} from '../settings.ts'
import type { AtBookEnd, Resume, Settings } from '../types.ts'
import { controlClassName, controlView } from './control.ts'

const AT_BOOK_END_LABEL: Record<AtBookEnd, string> = {
  next: 'Next book',
  wrap: 'Back to start',
  stop: 'Stay put',
}

const AT_BOOK_END_ORDER: ReadonlyArray<AtBookEnd> = ['next', 'wrap', 'stop']

const RESUME_LABEL: Record<Resume, string> = {
  continue: 'Go there',
  ask: 'Ask',
  restart: 'Start over',
}

const RESUME_ORDER: ReadonlyArray<Resume> = ['continue', 'ask', 'restart']

const settingRowClassName =
  'flex flex-wrap items-center justify-between gap-3 border-b border-edge py-3'

/** 설정 한 줄. 왼쪽에 무엇을 정하는지, 오른쪽에 그것을 정하는 것. */
const settingRow = <Msg>(label: string, control: Html, h: HtmlBuilder<Msg>): Html =>
  h.div([h.Class(settingRowClassName)], [h.span([h.Class('text-sm text-ink')], [label]), control])

/**
 * 여럿 중 하나를 고르는 줄. 고른 것이 `aria-pressed`로 드러나므로, 어느 것이
 * 켜져 있는지 보이지 않고도 읽힌다.
 */
const choiceView = <A extends string, Msg>(
  options: ReadonlyArray<A>,
  chosen: A,
  label: (option: A) => string,
  toMessage: (option: A) => Msg,
  h: HtmlBuilder<Msg>,
): Html =>
  h.div(
    [h.Class('flex flex-wrap gap-2')],
    Array.map(options, (option) =>
      h.keyed('span')(
        option,
        [h.Class('contents')],
        [
          controlView(
            {
              label: label(option),
              message: toMessage(option),
              attributes: [h.AriaPressed(option === chosen ? 'true' : 'false')],
            },
            h,
          ),
        ],
      ),
    ),
  )

/** 숫자를 한 걸음씩 옮기는 줄. 범위의 끝에서는 그쪽 버튼이 막힌다. */
const nudgeView = <Msg>(
  config: Readonly<{
    shown: string
    down: Readonly<{ label: string; message: Msg; isBlocked: boolean }>
    up: Readonly<{ label: string; message: Msg; isBlocked: boolean }>
  }>,
  h: HtmlBuilder<Msg>,
): Html =>
  h.div(
    [h.Class('flex items-center gap-2')],
    [
      controlView(
        {
          label: '−',
          message: config.down.message,
          attributes: [h.AriaLabel(config.down.label), h.AriaDisabled(config.down.isBlocked)],
        },
        h,
      ),
      h.span([h.Class('w-12 text-center text-sm tabular-nums text-muted')], [config.shown]),
      controlView(
        {
          label: '+',
          message: config.up.message,
          attributes: [h.AriaLabel(config.up.label), h.AriaDisabled(config.up.isBlocked)],
        },
        h,
      ),
    ],
  )

/** 스위치 한 줄. 이름을 자기 라벨에서 가져가므로 줄 전체를 스위치가 그린다. */
const switchRow = <Msg>(
  config: Readonly<{
    id: string
    label: string
    isChecked: boolean
    onToggle: (isChecked: boolean) => Msg
  }>,
  h: HtmlBuilder<Msg>,
): Html =>
  Switch.view(
    {
      id: config.id,
      isChecked: config.isChecked,
      onToggle: config.onToggle,
      toView: (attributes) =>
        h.div(
          [h.Class(settingRowClassName)],
          [
            h.span([...attributes.label, h.Class('text-sm text-ink')], [config.label]),
            h.button(
              [...attributes.button, h.Class(controlClassName)],
              [config.isChecked ? 'On' : 'Off'],
            ),
          ],
        ),
    },
    h,
  )

/**
 * 패널이 부르는 쪽에서 받아야 하는 것.
 *
 * 스위치의 `id`도 받는다. 같은 `id`를 가진 스위치가 한 문서에 둘 있으면 라벨이
 * 어느 쪽을 가리키는지 알 수 없다.
 */
export type SettingsHandlers<Msg> = Readonly<{
  /** 패널이 서는 자리의 접근 가능한 이름. */
  title: string
  /** 스위치 `id`의 앞머리. 리더와 책장이 서로 다른 것을 준다. */
  idPrefix: string
  onClose: Msg
  onToggleCoverAlone: (isChecked: boolean) => Msg
  onToggleSplitWide: (isChecked: boolean) => Msg
  onToggleEnlargeToFit: (isChecked: boolean) => Msg
  onToggleRememberBookSettings: (isChecked: boolean) => Msg
  onNudgeThreshold: (by: number) => Msg
  onNudgeSlideSeconds: (by: number) => Msg
  onSelectAtBookEnd: (atBookEnd: AtBookEnd) => Msg
  onSelectResume: (resume: Resume) => Msg
}>

/** 설정 패널을 그린다. 덮는 자리 전체를 차지하는 `dialog`다. */
export const settingsView = <Msg>(
  settings: Settings,
  handlers: SettingsHandlers<Msg>,
  h: HtmlBuilder<Msg>,
): Html =>
  h.div(
    [
      h.Class('absolute inset-0 z-10 flex flex-col bg-bg/95 backdrop-blur-sm'),
      h.Role('dialog'),
      h.AriaLabel(handlers.title),
    ],
    [
      h.div(
        [h.Class('flex items-center gap-2 border-b border-edge px-4 py-2')],
        [
          h.span([h.Class('mr-auto text-sm text-muted')], [handlers.title]),
          controlView({ label: 'Close', message: handlers.onClose }, h),
        ],
      ),
      h.div(
        [h.Class('flex-1 overflow-y-auto px-4')],
        [
          switchRow(
            {
              id: `${handlers.idPrefix}-cover-alone`,
              label: 'Cover on its own',
              isChecked: settings.coverAlone,
              onToggle: handlers.onToggleCoverAlone,
            },
            h,
          ),
          settingRow(
            'A page wider than this stands alone',
            nudgeView(
              {
                shown: settings.singleThreshold.toFixed(2),
                down: {
                  label: 'Pair more pages',
                  message: handlers.onNudgeThreshold(-THRESHOLD_STEP),
                  isBlocked: settings.singleThreshold <= THRESHOLD_MIN,
                },
                up: {
                  label: 'Pair fewer pages',
                  message: handlers.onNudgeThreshold(THRESHOLD_STEP),
                  isBlocked: settings.singleThreshold >= THRESHOLD_MAX,
                },
              },
              h,
            ),
            h,
          ),
          switchRow(
            {
              id: `${handlers.idPrefix}-split-wide`,
              label: 'Read wide pages in halves',
              isChecked: settings.splitWide,
              onToggle: handlers.onToggleSplitWide,
            },
            h,
          ),
          switchRow(
            {
              id: `${handlers.idPrefix}-enlarge-to-fit`,
              label: 'Stretch small pages to fit',
              isChecked: settings.enlargeToFit,
              onToggle: handlers.onToggleEnlargeToFit,
            },
            h,
          ),
          switchRow(
            {
              id: `${handlers.idPrefix}-remember-book-settings`,
              label: 'Remember these for each book',
              isChecked: settings.rememberBookSettings,
              onToggle: handlers.onToggleRememberBookSettings,
            },
            h,
          ),
          settingRow(
            'A slideshow stays on a page for',
            nudgeView(
              {
                shown: `${settings.slideSeconds}s`,
                down: {
                  label: 'Spend less time on a page',
                  message: handlers.onNudgeSlideSeconds(-SLIDE_STEP),
                  isBlocked: settings.slideSeconds <= SLIDE_MIN,
                },
                up: {
                  label: 'Spend more time on a page',
                  message: handlers.onNudgeSlideSeconds(SLIDE_STEP),
                  isBlocked: settings.slideSeconds >= SLIDE_MAX,
                },
              },
              h,
            ),
            h,
          ),
          settingRow(
            'At the end of a book',
            choiceView(
              AT_BOOK_END_ORDER,
              settings.atBookEnd,
              (option) => AT_BOOK_END_LABEL[option],
              handlers.onSelectAtBookEnd,
              h,
            ),
            h,
          ),
          settingRow(
            'Opening a book you were part way through',
            choiceView(
              RESUME_ORDER,
              settings.resume,
              (option) => RESUME_LABEL[option],
              handlers.onSelectResume,
              h,
            ),
            h,
          ),
        ],
      ),
    ],
  )
