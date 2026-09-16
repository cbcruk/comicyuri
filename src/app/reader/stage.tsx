/**
 * 페이지가 걸리는 화면. 맞춤 모드, 세운 각도, 반씩 읽기, 확대와 이동이 여기서 한 상자에
 * 풀린다.
 *
 * Foldkit의 `src/page/reader/view/stage.ts`를 그대로 옮긴 것이다. 클래스도 id도 `alt`도
 * 같아야 한다 — e2e가 그것으로 페이지를 집고, 굴림이 갈 수 있는 거리도 이 상자를 재서
 * 나온다.
 */

import { Option } from 'effect'
import clsx from 'clsx'

import { PAGE_ID, STAGE_ID } from '../../reader/constant.ts'
import { ZOOM_MIN } from '../../reader/gesture.ts'
import type { Point } from '../../reader/gesture.ts'
import { sideOf } from '../../reader/half.ts'
import { swapsSides } from '../../reader/rotation.ts'
import { indexOfPage, pagesAt, splitRatio, spreadsFor } from '../../reader/spread.ts'
import type { Layout } from '../../reader/spread.ts'
import type { SpreadPanel } from '../../atoms/pages.ts'
import type { Model, PageEntry, TapFlash } from '../../reader/model.ts'
import type { FitMode } from '../../types.ts'
import type { OnScreen } from './session.ts'

/**
 * 맞춤 모드에 따라 페이지를 화면에 어떻게 앉힐지.
 *
 * 통째로 맞춤은 최대 크기만 걸고 크기는 이미지에 맡긴다. 그래서 화면보다 작은 페이지는
 * 원래 크기 그대로 선다 — 줄이기만 하고 늘리지는 않는다.
 */
const FIT_CLASS: Readonly<Record<FitMode, string>> = {
  contain: 'max-h-full max-w-full object-contain',
  width: 'w-full object-contain',
  height: 'h-full object-contain',
  original: 'max-w-none',
}

/**
 * 늘리지 않기로 했을 때 채우는 맞춤에 함께 거는 상한. `max-content`가 그 이미지의 원래
 * 크기이므로, 채우되 원본을 넘지는 않는다.
 */
const NO_ENLARGE_CLASS: Readonly<Record<FitMode, string>> = {
  contain: '',
  width: 'max-w-max',
  height: 'max-h-max',
  original: '',
}

const fitClassName = (fit: FitMode, enlargeToFit: boolean): string =>
  clsx(FIT_CLASS[fit], { [NO_ENLARGE_CLASS[fit]]: !enlargeToFit && NO_ENLARGE_CLASS[fit] !== '' })

/** 반씩 읽는 중인 페이지와, 그중 지금 보고 있는 쪽. */
type SplitHalf = Readonly<{
  /** 나뉘기 전 페이지의 가로세로비. 반쪽은 그 절반이다. */
  ratio: number
  /** 화면의 어느 쪽 반인지. */
  side: 'left' | 'right'
}>

/**
 * 반쪽 하나. 상자가 반쪽의 비를 지고 화면 안에 들어가고, 그 안에서 이미지는 두 배 너비로
 * 서서 보고 있는 쪽만 상자에 걸린다.
 *
 * 상자 크기를 컨테이너 단위로 재는 이유는 세워 둔 페이지 때문이다(`R-228`). 페이지를 담은
 * 상자가 누우면 `cqw`·`cqh`도 함께 누우므로 반쪽이 그것을 따라간다.
 */
const HalfPanel = ({ panel, half }: Readonly<{ panel: SpreadPanel; half: SplitHalf }>) => {
  const ratio = half.ratio / 2

  return (
    <div
      className="relative overflow-hidden"
      style={{ width: `min(100cqw, calc(100cqh * ${ratio}))`, aspectRatio: `${ratio}` }}
    >
      <img
        className="absolute top-0 h-full w-[200%] max-w-none"
        style={{ left: half.side === 'left' ? '0' : '-100%' }}
        src={panel.url}
        alt={`Page ${panel.page + 1}`}
        draggable={false}
      />
    </div>
  )
}

const FitPanel = ({
  panel,
  fit,
  enlargeToFit,
}: Readonly<{ panel: SpreadPanel; fit: FitMode; enlargeToFit: boolean }>) => (
  <img
    className={fitClassName(fit, enlargeToFit)}
    src={panel.url}
    alt={`Page ${panel.page + 1}`}
    // 이미지는 기본으로 끌 수 있고, 끌기 시작하면 브라우저가 포인터 이벤트를 거두어 드래그
    // 이벤트로 갈아탄다. 그러면 스와이프가 첫 움직임 뒤에 잘린다 — 포인터로 넘기려던
    // 페이지 대신 이미지가 끌려간다.
    draggable={false}
  />
)

/**
 * 페이지 넘김 표시를 그릴지. `import.meta.hot`은 개발과 프로덕션 빌드를 가르는 값이고 빌드
 * 때 상수로 바뀌므로, 프로덕션 번들에서는 표시도 그것을 그리는 분기도 사라진다.
 *
 * Model은 어느 쪽이든 넘김을 기록한다. 그것을 조건 없이 두었기에 어떤 빌드가 도는지 묻지
 * 않고도 동작을 테스트할 수 있다.
 */
const SHOWS_TAP_FLASH = !!import.meta.hot

const TapFlashMark = ({ flash }: Readonly<{ flash: TapFlash }>) => (
  <div
    className={clsx(
      'tap-flash pointer-events-none absolute inset-y-0 w-1/3',
      flash.side === 'Left'
        ? 'left-0 bg-gradient-to-r from-accent to-transparent'
        : 'right-0 bg-gradient-to-l from-accent to-transparent',
    )}
    aria-hidden={true}
  />
)

/** 페이지 상자에 걸린 배율과 이동. 화면에 걸린 스프레드를 그릴 때의 값이다. */
type Transform = Readonly<{ zoom: number; pan: Point }>

/**
 * 페이지를 담는 상자의 클래스. 맞춤 모드와 세운 각도, 들어선 쪽이 여기서 풀린다.
 *
 * 맞춤 모드는 페이지에 `h-full`·`w-full`·`max-h-full`을 건다. 퍼센트 크기는 담는 상자가
 * 크기를 정해 두어야 풀리는데, 이 상자는 스테이지의 flex 자식이라 내버려 두면 내용만큼만
 * 커진다. 그러면 페이지가 자기 크기를 기준으로 자기를 재는 꼴이라 어떤 맞춤 모드도 듣지
 * 않는다.
 *
 * 세로로 세우는 것은 `items-center-safe`다. 화면에 들어가는 페이지는 가운데에 놓고, 넘치는
 * 페이지는 잘리는 쪽 대신 시작하는 쪽에 붙인다.
 *
 * 뒤로 넘겨 온 페이지는 끝에서 시작한다(`R-247`). `flex-wrap-reverse`가 교차축의 시작을
 * 아래로 뒤집으므로, 넘치는 쪽에 붙는 자리도 함께 뒤집힌다.
 */
const pageBoxClassName = (model: Model, entry: PageEntry, { zoom, pan }: Transform): string =>
  clsx('flex items-center-safe justify-center gap-1 [container-type:size]', {
    // 눕힌 상자는 가로와 세로가 맞바뀐다. 그래야 세운 페이지에 맞춤 모드가 화면 크기대로
    // 걸린다.
    'h-full w-full': !swapsSides(model.rotation),
    'h-[100cqw] w-[100cqh]': swapsSides(model.rotation),
    'flex-row-reverse': model.settings.direction === 'rtl',
    'flex-wrap-reverse': entry === 'end',
    // 확대를 풀고 제자리로 돌아가는 것은 애니메이션할 값이 있지만, 끌고 있는 중도, 굴려서
    // 페이지를 움직이는 중도 아니다.
    'transition-transform': zoom === ZOOM_MIN && pan.x === 0 && pan.y === 0,
  })

/** 화면에 걸린 스프레드가 반씩 읽히는 중이면, 그 페이지의 비와 보고 있는 쪽. */
const splitOf = (model: Model, layout: Layout, shown: OnScreen): Option.Option<SplitHalf> => {
  const spreads = spreadsFor(layout, model.settings)
  const here = pagesAt(spreads, indexOfPage(spreads, shown.page))

  return Option.map(splitRatio(layout, model.settings, here), (ratio): SplitHalf => ({
    ratio,
    side: sideOf(shown.half, model.settings.direction),
  }))
}

/** 화면에 걸린 스프레드의 이미지들. 반씩 읽는 중이면 보고 있는 반쪽만 건다(`R-229`). */
const SpreadPanels = ({
  model,
  layout,
  shown,
}: Readonly<{ model: Model; layout: Layout; shown: OnScreen }>) => {
  const maybeHalf = splitOf(model, layout, shown)

  return (
    <>
      {shown.panels.map((panel) =>
        Option.match(maybeHalf, {
          onNone: () => (
            <FitPanel
              key={panel.page}
              panel={panel}
              fit={model.settings.fit}
              enlargeToFit={model.settings.enlargeToFit}
            />
          ),
          onSome: (half) => (
            <HalfPanel key={`${panel.page}-${half.side}`} panel={panel} half={half} />
          ),
        }),
      )}
    </>
  )
}

/** 스테이지가 받는 것. */
export type ReaderStageProps = Readonly<{
  model: Model
  layout: Layout
  /** 화면에 걸린 스프레드. 아직 아무것도 그릴 수 없으면 없음이다(`R-207`). */
  maybeShown: Option.Option<OnScreen>
  /** 지금 스프레드가 아직 오는 중인지. 늦으면 남아 있는 페이지 위에 표시가 선다. */
  isLoading: boolean
  /** 부르다 실패했을 때의 문구. */
  maybeFailure: Option.Option<string>
}>

/**
 * 페이지가 걸리는 화면을 그린다.
 *
 * 이 면이 곧 제스처를 받는 면이다. 그래서 포인터 구독이 찾는 id를 달고, 터치 처리를
 * 브라우저에서 가져온다. 줌과 이동은 안쪽 요소에 걸린 하나의 transform이다 — 제스처
 * 계산이 쓰는 중심 기준 좌표가 계속 그 뜻을 지키려면 바깥쪽은 가만히 있어야 한다.
 *
 * 그리는 것은 Model의 `page`가 아니라 화면에 걸린 스프레드다. 넘긴 뒤 다음 것이 그릴 수
 * 있게 될 때까지는 이전 스프레드가 그 배율 그대로 남는다(`R-207`).
 */
export const ReaderStage = ({
  model,
  layout,
  maybeShown,
  isLoading,
  maybeFailure,
}: ReaderStageProps) => {
  const { zoom, pan }: Transform = Option.getOrElse(maybeShown, () => model)
  const page = Option.match(maybeShown, {
    onNone: () => model.page,
    onSome: (shown) => shown.page,
  })
  const entry = Option.match(maybeShown, {
    onNone: () => model.entry,
    onSome: (shown) => shown.entry,
  })

  return (
    <div
      id={STAGE_ID}
      // 세운 페이지를 담을 상자는 화면의 높이만큼 넓어야 한다. `cqh`·`cqw`가 그 두 값을
      // 주고, 그러려면 스테이지가 크기를 재는 컨테이너여야 한다.
      className="relative flex flex-1 touch-none items-center justify-center overflow-hidden bg-black/20 p-2 [container-type:size]"
    >
      {/*
        화면에 걸린 페이지 번호를 키로 삼아, 걸린 페이지가 바뀔 때마다 이 상자를 새로
        세운다. 그러지 않으면 앞 페이지를 굴려 둔 자리에서 새 페이지가 미끄러져 들어온다 —
        상자에 건 `transition-transform`이 그 transform까지 애니메이션할 값으로 보기
        때문이다. 미끄러지는 동안에는 페이지가 어디까지 왔는지 재는 값도 사실이 아니다.
        `model.page`를 키로 삼으면 이전 페이지가 남아 있는 동안 상자만 먼저 바뀐다.
      */}
      <div
        key={String(page)}
        id={PAGE_ID}
        className={pageBoxClassName(model, entry, { zoom, pan })}
        // 세우는 것이 맨 오른쪽이라 먼저 걸린다. 그래서 확대와 이동은 세운 뒤에도 화면
        // 좌표 그대로다 — 제스처가 재는 좌표와 같은 뜻으로 남는다.
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${model.rotation}deg)`,
        }}
      >
        {Option.match(maybeFailure, {
          onNone: () =>
            Option.match(maybeShown, {
              onNone: () => (isLoading ? <p className="text-sm text-muted">Loading…</p> : null),
              onSome: (shown) => <SpreadPanels model={model} layout={layout} shown={shown} />,
            }),
          onSome: (text) => <p className="text-sm text-danger">{text}</p>,
        })}
      </div>
      {/*
        늦을 때만 서는 표시. 나타나는 것을 CSS가 300ms 미루므로, 미리 읽어 둔 이웃으로
        넘기면 보일 일이 없다. 늦는지 재는 타이머를 Model에 두지 않으려고 CSS에 맡긴다.
      */}
      {isLoading && Option.isSome(maybeShown) ? (
        <p
          key={`loading-${model.page}`}
          role="status"
          className="loading-late pointer-events-none absolute right-3 bottom-3 rounded-md bg-bg/80 px-2 py-1 text-xs text-muted"
        >
          Loading…
        </p>
      ) : null}
      {SHOWS_TAP_FLASH
        ? Option.match(model.maybeTapFlash, {
            onNone: () => null,
            onSome: (flash) => <TapFlashMark key={`${flash.side}-${flash.token}`} flash={flash} />,
          })
        : null}
    </div>
  )
}
