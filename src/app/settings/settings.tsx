/**
 * 읽는 규칙을 한 번 정해 두는 패널. 리더와 책장이 같은 것을 연다.
 *
 * 리더에서 열면 전역 기본값에 그 책에 걸린 것까지 합친 결과를 보여 주고
 * (`R-2B3`), 책장에서 열면 전역 기본값 그대로다(`R-2B6`). 어느 쪽에서 열어도
 * 같은 항목이 같은 순서로 서야 하므로 컴포넌트는 한 벌만 둔다.
 *
 * 값을 들고 있지 않는다. 지금의 {@linkcode Settings}와 콜백을 받을 뿐이라, 무엇을
 * 저장할지는 부르는 쪽이 정한다. 리더의 Message와 책장의 Message가 서로 다른
 * 타입이라, 그것을 여기서 고르면 한쪽에서만 쓸 수 있는 패널이 된다.
 */

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

import { Dialog } from '@astryxdesign/core/Dialog'
import { Switch } from '@astryxdesign/core/Switch'

import {
  SLIDE_MAX,
  SLIDE_MIN,
  SLIDE_STEP,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  THRESHOLD_STEP,
} from '../../settings.ts'
import type { AtBookEnd, Resume, Settings } from '../../types.ts'

const AT_BOOK_END_LABEL: Readonly<Record<AtBookEnd, string>> = {
  next: 'Next book',
  wrap: 'Back to start',
  stop: 'Stay put',
}

const AT_BOOK_END_ORDER: ReadonlyArray<AtBookEnd> = ['next', 'wrap', 'stop']

const RESUME_LABEL: Readonly<Record<Resume, string>> = {
  continue: 'Go there',
  ask: 'Ask',
  restart: 'Start over',
}

const RESUME_ORDER: ReadonlyArray<Resume> = ['continue', 'ask', 'restart']

/**
 * 패널에 선 버튼 하나의 겉모습. Foldkit 쪽 `controlView`가 쓰던 토큰 그대로다.
 *
 * Astryx의 `Button`을 쓰지 않는 이유는 이 패널의 버튼이 앱의 다른 버튼과 같은
 * 색이어야 하기 때문이다. 그 색은 Astryx 토큰이 아니라 `styles.css`의 것이다.
 */
const controlClassName =
  'cursor-pointer rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const settingRowClassName =
  'flex flex-wrap items-center justify-between gap-3 border-b border-edge py-3'

/** 설정 한 줄. 왼쪽에 무엇을 정하는지, 오른쪽에 그것을 정하는 것. */
const SettingRow = ({ label, children }: Readonly<{ label: string; children: ReactNode }>) => (
  <div className={settingRowClassName}>
    <span className="text-sm text-ink">{label}</span>
    {children}
  </div>
)

/**
 * 여럿 중 하나를 고르는 줄. 고른 것이 `aria-pressed`로 드러나므로, 어느 것이
 * 켜져 있는지 보이지 않고도 읽힌다.
 */
const ChoiceRow = <A extends string>({
  options,
  chosen,
  labels,
  onSelect,
}: Readonly<{
  options: ReadonlyArray<A>
  chosen: A
  labels: Readonly<Record<A, string>>
  onSelect: (option: A) => void
}>) => (
  <div className="flex flex-wrap gap-2">
    {options.map((option) => (
      <button
        key={option}
        type="button"
        className={controlClassName}
        aria-pressed={option === chosen}
        onClick={() => onSelect(option)}
      >
        {labels[option]}
      </button>
    ))}
  </div>
)

/** 숫자를 한 걸음 옮기는 버튼 하나가 필요한 것. */
type NudgeEnd = Readonly<{
  /** 버튼의 접근 가능한 이름. 적히는 글자는 `−`와 `+`뿐이라 이름을 따로 준다. */
  label: string
  /** 범위의 그쪽 끝에 닿았는지. `aria-disabled`가 된다. */
  isBlocked: boolean
  onNudge: () => void
}>

/**
 * 숫자를 한 걸음씩 옮기는 줄. 범위의 끝에서는 그쪽 버튼이 막힌다(`R-2B2`).
 *
 * 막힌 버튼도 눌리기는 한다. 값을 끊는 것은 `nudgedThreshold`와
 * `nudgedSlideSeconds`의 일이라, 여기서 한 번 더 끊으면 범위가 두 곳에 적힌다.
 */
const NudgeRow = ({
  shown,
  down,
  up,
}: Readonly<{ shown: string; down: NudgeEnd; up: NudgeEnd }>) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      className={controlClassName}
      aria-label={down.label}
      aria-disabled={down.isBlocked}
      onClick={down.onNudge}
    >
      −
    </button>
    <span className="w-12 text-center text-sm tabular-nums text-muted">{shown}</span>
    <button
      type="button"
      className={controlClassName}
      aria-label={up.label}
      aria-disabled={up.isBlocked}
      onClick={up.onNudge}
    >
      +
    </button>
  </div>
)

/**
 * 스위치 한 줄. 이름을 자기 라벨에서 가져가므로 줄 전체를 스위치가 그린다.
 *
 * `aria-checked`를 손으로 세운다. Astryx의 `Switch`는 `role="switch"`를 단 네이티브
 * 체크박스라 켜짐이 `checked` 프로퍼티에만 남는데, e2e가 그것을 속성으로 읽는다
 * (`R-2B1`, `R-2B6`). 여벌 프로퍼티는 입력이 아니라 바깥 줄로 흘러가므로 ref로
 * 세우는 길밖에 없다.
 */
const SwitchRow = ({
  label,
  isChecked,
  onToggle,
}: Readonly<{ label: string; isChecked: boolean; onToggle: (isChecked: boolean) => void }>) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.setAttribute('aria-checked', isChecked ? 'true' : 'false')
  }, [isChecked])

  return (
    <div className={settingRowClassName}>
      <Switch
        ref={inputRef}
        label={label}
        value={isChecked}
        onChange={onToggle}
        labelPosition="start"
        labelSpacing="spread"
        width="100%"
      />
    </div>
  )
}

/**
 * 패널이 부르는 쪽에서 받아야 하는 것.
 *
 * 걸음 폭은 여기서 정하지 않는다. `onNudgeThreshold`와 `onNudgeSlideSeconds`가
 * 받는 것은 부호가 붙은 걸음(`±THRESHOLD_STEP`, `±SLIDE_STEP`)이고, 그것을 더해
 * 범위 안에 끊는 것은 `src/settings.ts`의 몫이다.
 */
export type SettingsPanelProps = Readonly<{
  /** 패널이 서 있는지. 닫혀 있으면 화면에서 빠진다. */
  isOpen: boolean
  settings: Settings
  /**
   * 패널이 서는 자리의 접근 가능한 이름. 리더와 책장이 같은 것을 쓴다(`R-2B6`).
   */
  title?: string
  onClose: () => void
  onToggleCoverAlone: (isChecked: boolean) => void
  onToggleSplitWide: (isChecked: boolean) => void
  onToggleEnlargeToFit: (isChecked: boolean) => void
  onToggleRememberBookSettings: (isChecked: boolean) => void
  onNudgeThreshold: (by: number) => void
  onNudgeSlideSeconds: (by: number) => void
  onSelectAtBookEnd: (atBookEnd: AtBookEnd) => void
  onSelectResume: (resume: Resume) => void
}>

/**
 * 설정 패널을 그린다. 덮는 자리 전체를 차지하는 `dialog`다(`R-2B1`).
 *
 * `purpose`가 `form`이라 Escape로도 닫힌다. Foldkit 쪽은 Close 버튼으로만 닫혔지만,
 * 아무 길로도 닫히지 않는 `required`는 역할이 `alertdialog`로 바뀌어 "Reading
 * settings라는 이름의 `dialog`"를 찾는 e2e가 이 패널을 잃는다.
 */
export const SettingsPanel = ({
  isOpen,
  settings,
  title = 'Reading settings',
  onClose,
  onToggleCoverAlone,
  onToggleSplitWide,
  onToggleEnlargeToFit,
  onToggleRememberBookSettings,
  onNudgeThreshold,
  onNudgeSlideSeconds,
  onSelectAtBookEnd,
  onSelectResume,
}: SettingsPanelProps) => (
  <Dialog
    isOpen={isOpen}
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
    variant="fullscreen"
    purpose="form"
    padding={0}
    aria-label={title}
  >
    <div className="flex h-full flex-col bg-bg text-ink">
      <div className="flex items-center gap-2 border-b border-edge px-4 py-2">
        <span className="mr-auto text-sm text-muted">{title}</span>
        <button type="button" className={controlClassName} onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4">
        <SwitchRow
          label="Cover on its own"
          isChecked={settings.coverAlone}
          onToggle={onToggleCoverAlone}
        />
        <SettingRow label="A page wider than this stands alone">
          <NudgeRow
            shown={settings.singleThreshold.toFixed(2)}
            down={{
              label: 'Pair more pages',
              isBlocked: settings.singleThreshold <= THRESHOLD_MIN,
              onNudge: () => onNudgeThreshold(-THRESHOLD_STEP),
            }}
            up={{
              label: 'Pair fewer pages',
              isBlocked: settings.singleThreshold >= THRESHOLD_MAX,
              onNudge: () => onNudgeThreshold(THRESHOLD_STEP),
            }}
          />
        </SettingRow>
        <SwitchRow
          label="Read wide pages in halves"
          isChecked={settings.splitWide}
          onToggle={onToggleSplitWide}
        />
        <SwitchRow
          label="Stretch small pages to fit"
          isChecked={settings.enlargeToFit}
          onToggle={onToggleEnlargeToFit}
        />
        <SwitchRow
          label="Remember these for each book"
          isChecked={settings.rememberBookSettings}
          onToggle={onToggleRememberBookSettings}
        />
        <SettingRow label="A slideshow stays on a page for">
          <NudgeRow
            shown={`${settings.slideSeconds}s`}
            down={{
              label: 'Spend less time on a page',
              isBlocked: settings.slideSeconds <= SLIDE_MIN,
              onNudge: () => onNudgeSlideSeconds(-SLIDE_STEP),
            }}
            up={{
              label: 'Spend more time on a page',
              isBlocked: settings.slideSeconds >= SLIDE_MAX,
              onNudge: () => onNudgeSlideSeconds(SLIDE_STEP),
            }}
          />
        </SettingRow>
        <SettingRow label="At the end of a book">
          <ChoiceRow
            options={AT_BOOK_END_ORDER}
            chosen={settings.atBookEnd}
            labels={AT_BOOK_END_LABEL}
            onSelect={onSelectAtBookEnd}
          />
        </SettingRow>
        <SettingRow label="Opening a book you were part way through">
          <ChoiceRow
            options={RESUME_ORDER}
            chosen={settings.resume}
            labels={RESUME_LABEL}
            onSelect={onSelectResume}
          />
        </SettingRow>
      </div>
    </div>
  </Dialog>
)
