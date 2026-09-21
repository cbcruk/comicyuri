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

import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'

import { Button } from '@astryxdesign/core/Button'
import { Dialog } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Switch } from '@astryxdesign/core/Switch'
import {
  colorVars,
  fontWeightVars,
  spacingVars,
  textSizeVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex'

import {
  SLIDE_MAX,
  SLIDE_MIN,
  SLIDE_STEP,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  THRESHOLD_STEP,
} from '../../settings.ts'
import type { AtBookEnd, LocaleSetting, Resume, Settings } from '../../types.ts'
import type { Catalog } from '../i18n/en.ts'
import { useMessages } from '../i18n/messages.ts'

const AT_BOOK_END_ORDER: ReadonlyArray<AtBookEnd> = ['next', 'wrap', 'stop']

const RESUME_ORDER: ReadonlyArray<Resume> = ['continue', 'ask', 'restart']

const LOCALE_ORDER: ReadonlyArray<LocaleSetting> = ['auto', 'en', 'ko']

/** 고르는 줄에 적히는 이름들. 같은 카탈로그에서 온다(`S-151`). */
const atBookEndLabels = (words: Catalog['settings']): Readonly<Record<AtBookEnd, string>> => ({
  next: words.nextBook,
  wrap: words.backToStart,
  stop: words.stayPut,
})

const resumeLabels = (words: Catalog['settings']): Readonly<Record<Resume, string>> => ({
  continue: words.goThere,
  ask: words.ask,
  restart: words.startOver,
})

/**
 * 언어를 고르는 줄에 적히는 이름들.
 *
 * 언어 이름은 그 언어로 적는다 — `English`와 `한국어`다. 영어로 보는 중에 한국어를 찾는
 * 사람에게 `Korean`은 읽을 수 없는 이름이다. `auto`만은 무엇을 따른다는 말이라 옮긴다.
 */
const localeLabels = (words: Catalog['settings']): Readonly<Record<LocaleSetting, string>> => ({
  auto: words.languageAuto,
  en: words.languageEnglish,
  ko: words.languageKorean,
})

/**
 * 설정 패널의 모양. 크기와 색은 모두 Astryx 토큰에서 온다.
 *
 * 위 막대와 스크롤되는 본문은 `Layout`이, 줄 세우기와 간격은 `HStack`의 props가 맡는다.
 * 여기에는 색과 줄 사이 구분선처럼 그것들이 말하지 못하는 것만 남는다.
 */
const styles = stylex.create({
  panel: {
    backgroundColor: colorVars['--color-background-body'],
    color: colorVars['--color-text-primary'],
  },
  title: {
    marginInlineEnd: 'auto',
    fontSize: textSizeVars['--font-size-base'],
    color: colorVars['--color-text-secondary'],
  },
  // `LayoutContent`의 여백은 가장자리마다 따로 적힌다. 축약형으로 적으면 StyleX에서 그것에 진다.
  rows: {
    paddingInlineStart: spacingVars['--spacing-4'],
    paddingInlineEnd: spacingVars['--spacing-4'],
  },
  row: {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  // 스위치 줄의 라벨(Astryx `FieldLabel`)과 같은 글자다. 따로 두면 줄마다 크기와 색이 갈린다.
  rowLabel: {
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
  },
  nudgeValue: {
    minWidth: spacingVars['--spacing-12'],
    textAlign: 'center',
    fontSize: textSizeVars['--font-size-base'],
    fontVariantNumeric: 'tabular-nums',
    color: colorVars['--color-text-secondary'],
  },
})

/** 설정 한 줄의 틀. 좁으면 오른쪽 것이 아래로 내려가고, 줄 사이에 구분선이 선다. */
const RowBox = ({ children }: Readonly<{ children: ReactNode }>) => (
  <HStack wrap="wrap" align="center" justify="between" gap={3} paddingBlock={3} xstyle={styles.row}>
    {children}
  </HStack>
)

/** 설정 한 줄. 왼쪽에 무엇을 정하는지, 오른쪽에 그것을 정하는 것. */
const SettingRow = ({ label, children }: Readonly<{ label: string; children: ReactNode }>) => (
  <RowBox>
    <span {...stylex.props(styles.rowLabel)}>{label}</span>
    {children}
  </RowBox>
)

/**
 * 여럿 중 하나를 고르는 줄. Astryx `SegmentedControl`이라 `radiogroup` 안의 `radio`로 서고,
 * 고른 것이 `aria-checked`로 드러난다.
 *
 * `SegmentedControl`은 고른 값을 문자열로 돌려준다. 받은 값을 선택지 목록에서 다시 찾아
 * 넘기므로, 목록 밖의 값이 부르는 쪽으로 새어 나가지 않는다.
 */
const ChoiceRow = <A extends string>({
  label,
  options,
  chosen,
  labels,
  onSelect,
}: Readonly<{
  label: string
  options: ReadonlyArray<A>
  chosen: A
  labels: Readonly<Record<A, string>>
  onSelect: (option: A) => void
}>) => (
  <SettingRow label={label}>
    <SegmentedControl
      label={label}
      value={chosen}
      onChange={(value) => {
        const option = options.find((candidate) => candidate === value)
        if (option !== undefined) onSelect(option)
      }}
    >
      {options.map((option) => (
        <SegmentedControlItem key={option} value={option} label={labels[option]} />
      ))}
    </SegmentedControl>
  </SettingRow>
)

/** 숫자를 한 걸음 옮기는 버튼 하나가 필요한 것. */
type NudgeEnd = Readonly<{
  /** 버튼의 접근 가능한 이름. 적히는 글자는 `−`와 `+`뿐이라 이름을 따로 준다. */
  label: string
  /** 범위의 그쪽 끝에 닿았는지. 버튼이 `aria-disabled`가 된다. */
  isBlocked: boolean
  onNudge: () => void
}>

/**
 * 숫자를 한 걸음씩 옮기는 줄. 범위의 끝에서는 그쪽 버튼이 막힌다(`R-2B2`).
 *
 * 막힌 버튼은 포커스를 잃지 않는다. Astryx `Button`은 툴팁이 있을 때만 막힘을 네이티브
 * `disabled` 대신 `aria-disabled`로 싣고, 그래야 키보드로 읽는 사람이 끝에 닿았다는 것을 그
 * 버튼에서 들을 수 있다. 그래서 두 버튼 모두 이름을 툴팁으로도 단다.
 *
 * 막힌 버튼을 눌러도 부르지 않는다. 값을 범위 안에서 끊는 것은 여전히 `nudgedThreshold`와
 * `nudgedSlideSeconds`의 일이라, 여기서 부르든 말든 값은 끝을 넘지 않는다.
 */
const NudgeRow = ({
  shown,
  down,
  up,
}: Readonly<{ shown: string; down: NudgeEnd; up: NudgeEnd }>) => (
  <HStack align="center" gap={2}>
    <Button
      label={down.label}
      icon={<span aria-hidden={true}>−</span>}
      isIconOnly={true}
      variant="secondary"
      size="sm"
      tooltip={down.label}
      isDisabled={down.isBlocked}
      onClick={down.onNudge}
    />
    <span {...stylex.props(styles.nudgeValue)}>{shown}</span>
    <Button
      label={up.label}
      icon={<span aria-hidden={true}>+</span>}
      isIconOnly={true}
      variant="secondary"
      size="sm"
      tooltip={up.label}
      isDisabled={up.isBlocked}
      onClick={up.onNudge}
    />
  </HStack>
)

/**
 * 스위치 한 줄. 이름을 자기 라벨에서 가져가므로 줄 전체를 스위치가 그린다.
 *
 * 켜짐은 `aria-checked`가 아니라 네이티브 `checked`가 말한다. Astryx의 `Switch`는
 * `role="switch"`를 단 체크박스이고, 체크박스의 켜짐은 브라우저가 접근성 트리에 스스로
 * 싣는다 — 거기에 속성을 덧다는 것은 ARIA in HTML이 하지 말라는 일이다.
 */
const SwitchRow = ({
  label,
  isChecked,
  onToggle,
}: Readonly<{ label: string; isChecked: boolean; onToggle: (isChecked: boolean) => void }>) => {
  return (
    <RowBox>
      <Switch
        label={label}
        value={isChecked}
        onChange={onToggle}
        labelPosition="start"
        labelSpacing="spread"
        width="100%"
      />
    </RowBox>
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
  /** 화면 문구의 언어를 골랐다(`S-151`). */
  onSelectLocale: (locale: LocaleSetting) => void
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
  title,
  onClose,
  onToggleCoverAlone,
  onToggleSplitWide,
  onToggleEnlargeToFit,
  onToggleRememberBookSettings,
  onNudgeThreshold,
  onNudgeSlideSeconds,
  onSelectAtBookEnd,
  onSelectResume,
  onSelectLocale,
}: SettingsPanelProps) => {
  const words = useMessages().settings

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      variant="fullscreen"
      purpose="form"
      padding={0}
      aria-label={title ?? words.title}
    >
      <Layout
        padding={0}
        xstyle={styles.panel}
        header={
          <LayoutHeader hasDivider={true} padding={0}>
            <HStack align="center" gap={2} paddingInline={4} paddingBlock={2}>
              <span {...stylex.props(styles.title)}>{title ?? words.title}</span>
              <Button label={words.close} variant="secondary" size="sm" onClick={onClose} />
            </HStack>
          </LayoutHeader>
        }
      >
        <LayoutContent padding={0} xstyle={styles.rows}>
          <SwitchRow
            label={words.coverAlone}
            isChecked={settings.coverAlone}
            onToggle={onToggleCoverAlone}
          />
          <SettingRow label={words.threshold}>
            <NudgeRow
              shown={settings.singleThreshold.toFixed(2)}
              down={{
                label: words.pairMore,
                isBlocked: settings.singleThreshold <= THRESHOLD_MIN,
                onNudge: () => onNudgeThreshold(-THRESHOLD_STEP),
              }}
              up={{
                label: words.pairFewer,
                isBlocked: settings.singleThreshold >= THRESHOLD_MAX,
                onNudge: () => onNudgeThreshold(THRESHOLD_STEP),
              }}
            />
          </SettingRow>
          <SwitchRow
            label={words.splitWide}
            isChecked={settings.splitWide}
            onToggle={onToggleSplitWide}
          />
          <SwitchRow
            label={words.enlargeToFit}
            isChecked={settings.enlargeToFit}
            onToggle={onToggleEnlargeToFit}
          />
          <SwitchRow
            label={words.rememberBookSettings}
            isChecked={settings.rememberBookSettings}
            onToggle={onToggleRememberBookSettings}
          />
          <SettingRow label={words.slideSeconds}>
            <NudgeRow
              shown={`${settings.slideSeconds}s`}
              down={{
                label: words.lessTime,
                isBlocked: settings.slideSeconds <= SLIDE_MIN,
                onNudge: () => onNudgeSlideSeconds(-SLIDE_STEP),
              }}
              up={{
                label: words.moreTime,
                isBlocked: settings.slideSeconds >= SLIDE_MAX,
                onNudge: () => onNudgeSlideSeconds(SLIDE_STEP),
              }}
            />
          </SettingRow>
          <ChoiceRow
            label={words.atBookEnd}
            options={AT_BOOK_END_ORDER}
            chosen={settings.atBookEnd}
            labels={atBookEndLabels(words)}
            onSelect={onSelectAtBookEnd}
          />
          <ChoiceRow
            label={words.resume}
            options={RESUME_ORDER}
            chosen={settings.resume}
            labels={resumeLabels(words)}
            onSelect={onSelectResume}
          />
          <ChoiceRow
            label={words.language}
            options={LOCALE_ORDER}
            chosen={settings.locale}
            labels={localeLabels(words)}
            onSelect={onSelectLocale}
          />
        </LayoutContent>
      </Layout>
    </Dialog>
  )
}
