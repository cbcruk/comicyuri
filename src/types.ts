import { Effect, Option, Schema } from 'effect'
import type { ArchiveError } from './errors.ts'
import type { ImageSize } from './imageSize.ts'

/**
 * 저장되는 모양은 평범한 타입이 아니라 스키마로 선언한다. `localStorage`에서
 * 믿을 수 없는 JSON으로 돌아오기 때문에, 들어올 때 캐스팅이 아니라 디코딩하고
 * 나갈 때 인코딩한다. 그 밖의 것은 평범한 인터페이스로 둔다.
 */

/** 페이지가 어느 쪽으로 넘어가는지. 만화는 `rtl`, 서양 코믹스는 `ltr`. */
export const ReadingDirection = Schema.Literals(['rtl', 'ltr'])
/** {@linkcode ReadingDirection} 스키마의 디코딩된 값. */
export type ReadingDirection = typeof ReadingDirection.Type

/** 화면이 한 번에 보여 주는 페이지 수. 한 장이거나 두 장 스프레드다. */
export const ViewMode = Schema.Literals(['single', 'spread'])
/** {@linkcode ViewMode} 스키마의 디코딩된 값. */
export type ViewMode = typeof ViewMode.Type

/**
 * 페이지를 화면에 맞추는 방식. 통째로 맞추거나, 너비를 채우거나, 높이를
 * 채우거나, 원래 픽셀 크기 그대로 둔다.
 */
export const FitMode = Schema.Literals(['contain', 'width', 'height', 'original'])
/** {@linkcode FitMode} 스키마의 디코딩된 값. */
export type FitMode = typeof FitMode.Type

/** 색 테마. 문서 루트의 `data-theme` 속성으로 페이지에 닿는다. */
export const Theme = Schema.Literals(['dark', 'light'])
/** {@linkcode Theme} 스키마의 디코딩된 값. */
export type Theme = typeof Theme.Type

/**
 * 책의 끝을 넘어서 넘기려 할 때 무엇을 할지.
 *
 * `stop`은 제자리에 머물고, `wrap`은 같은 책의 반대쪽 끝으로 가며, `next`는
 * 책장 순서상 이웃한 책을 그 자리에서 연다.
 */
export const AtBookEnd = Schema.Literals(['stop', 'wrap', 'next'])
/** {@linkcode AtBookEnd} 스키마의 디코딩된 값. */
export type AtBookEnd = typeof AtBookEnd.Type

/** 책의 페이지가 어디서 왔는지. 아카이브, 낱장 이미지 묶음, 아니면 고른 폴더다. */
export const BookSource = Schema.Literals(['zip', 'images', 'folder'])
/** {@linkcode BookSource} 스키마의 디코딩된 값. */
export type BookSource = typeof BookSource.Type

const DEFAULTS = {
  direction: 'rtl',
  view: 'single',
  fit: 'contain',
  theme: 'dark',
  coverAlone: true,
  singleThreshold: 0.74,
  enlargeToFit: true,
  atBookEnd: 'next',
  rememberBookSettings: false,
} as const

/**
 * 모든 필드가 기본값을 지고 있다. 그래서 예전 빌드가 써 둔 값도 실패하거나
 * 구멍을 남기지 않고 온전한 설정으로 디코딩된다.
 */
export const Settings = Schema.Struct({
  direction: ReadingDirection.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.direction)),
  ),
  view: ViewMode.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.view))),
  fit: FitMode.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.fit))),
  theme: Theme.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.theme))),
  /** 두 장 모드에서 맨 첫 장(표지)을 혼자 보여 준다. */
  coverAlone: Schema.Boolean.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.coverAlone)),
  ),
  /**
   * 이 가로세로비를 넘는 페이지는 두 장 모드에서도 혼자 나온다. 원본 뷰어의
   * "Single page:" 값과 같은 뜻이고 기본값도 같다. 인쇄된 만화 한 쪽은 대체로
   * 0.7 언저리이므로, 0.74를 넘는 페이지는 양면 삽화이거나 눕힌 스캔이다.
   */
  singleThreshold: Schema.Number.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.singleThreshold)),
  ),
  /**
   * 너비·높이 맞춤이 원본보다 작은 페이지를 화면에 맞춰 늘릴지.
   *
   * 저해상도 스캔본에서 갈린다. 늘리면 화면을 채우는 대신 뭉개지고, 늘리지 않으면
   * 선명한 대신 화면 한가운데에 작게 선다. 원본 뷰어의 "Max enlargement:"와 같은
   * 자리인데, 그쪽의 배수 대신 켜고 끄는 것 하나로 줄였다.
   *
   * 통째로 맞춤(`contain`)과 1:1은 애초에 늘리지 않으므로 이 값과 무관하다.
   */
  enlargeToFit: Schema.Boolean.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.enlargeToFit)),
  ),
  /**
   * 한 권을 다 읽고 계속 넘길 때 무엇을 할지. 원본 뷰어의 "Loop :"와 같은
   * 자리이며, 그쪽에서 다음 권을 여는 동작도 이것이었다.
   */
  atBookEnd: AtBookEnd.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.atBookEnd))),
  /**
   * 책마다 다른 설정을 기억할지. 켜 두면 읽는 동안 바꾼 배치가 전역 기본값이
   * 아니라 그 책에 남는다. 원본 뷰어의 "Remember chenged book setting of all
   * books"와 같은 자리다.
   */
  rememberBookSettings: Schema.Boolean.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.rememberBookSettings)),
  ),
})
/** {@linkcode Settings} 스키마의 디코딩된 값. */
export type Settings = typeof Settings.Type

/**
 * 아무것도 바꾼 적 없는 사람이 받는 설정. 만화 순서, 한 번에 한 장, 통째로
 * 맞춤, 어두운 테마, 표지는 혼자, 책 끝에서 다음 권으로, 설정은 모든 책이 함께.
 */
export const defaultSettings: Settings = DEFAULTS

/**
 * 책마다 달라질 수 있는 설정.
 *
 * 여기 있는 것은 책의 생김새를 따라가는 것들이다 — 만화인지 서양 코믹스인지,
 * 양면으로 스캔되었는지, 페이지가 얼마나 넓은지. 테마와 책 끝 동작, 그리고 이
 * 기억 자체를 켜고 끄는 스위치는 읽는 사람의 습관이라 전역에 남는다.
 */
export const BookSettings = Schema.Struct({
  direction: ReadingDirection,
  view: ViewMode,
  fit: FitMode,
  coverAlone: Schema.Boolean,
  singleThreshold: Schema.Number,
  enlargeToFit: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
})
/** {@linkcode BookSettings} 스키마의 디코딩된 값. */
export type BookSettings = typeof BookSettings.Type

/**
 * 자동 판정을 덮어쓰는 묶기. 그 페이지가 혼자 서거나, 다음 장과 묶인다.
 *
 * `spreads.ts`의 `Binding`에서 `auto`를 뺀 것이다. 표시가 없다는 것 자체가
 * `auto`라서, 저장할 값에는 그 자리가 없다.
 */
export const PageBinding = Schema.Literals(['alone', 'pair'])
/** {@linkcode PageBinding} 스키마의 디코딩된 값. */
export type PageBinding = typeof PageBinding.Type

/**
 * 페이지 하나에 손으로 걸어 둔 묶기.
 *
 * 자동 판정은 스캔본에서 곧잘 틀리고, 한 장이 어긋나면 그 뒤를 읽을 수 없다.
 * 이 표시가 그때의 탈출구이며 자동 판정보다 먼저 읽힌다.
 */
export const PageMark = Schema.Struct({
  page: Schema.Number,
  binding: PageBinding,
})
/** {@linkcode PageMark} 스키마의 디코딩된 값. */
export type PageMark = typeof PageMark.Type

/**
 * 페이지를 화면에 세우는 각도. 시계 방향이다.
 *
 * 눕혀 스캔된 책을 바로 세우는 데 쓴다. 읽는 사람의 습관이 아니라 그 책이 어떻게
 * 스캔되었는지를 적는 것이므로, 설정이 아니라 묶기 교정과 같은 자리에 산다.
 */
export const Rotation = Schema.Literals([0, 90, 180, 270])
/** {@linkcode Rotation} 스키마의 디코딩된 값. */
export type Rotation = typeof Rotation.Type

/** 책마다 저장되는 상태. 읽던 자리와 북마크, 손으로 고친 묶기, 세운 각도. */
export const BookProgress = Schema.Struct({
  page: Schema.Number,
  bookmarks: Schema.Array(Schema.Number),
  updatedAt: Schema.Number,
  /**
   * 디코딩 기본값을 지고 있다. 이 표시가 생기기 전에 저장된 책이 통째로
   * 기본값으로 떨어지면, 읽던 자리와 북마크까지 함께 잃는다.
   */
  marks: Schema.Array(PageMark).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
  /** 이 책을 세워 둔 각도. 같은 이유로 디코딩 기본값을 지고 있다. */
  rotation: Rotation.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0 as const))),
  /**
   * 이 책에만 걸린 설정. `rememberBookSettings`가 켜져 있는 동안 쓰인다.
   *
   * 스위치를 켜는 것은 지금 보고 있는 배치를 이 책의 것으로 삼는다는 뜻이고,
   * 끄면 전역 기본값으로 돌아간다. 꺼져 있는 동안 여기 남은 값은 쓰이지 않는다.
   *
   * `Option`이 아니라 `null`인 이유는 이것이 JSON으로 나갔다 들어오기
   * 때문이다. `Schema.Option`이 인코딩하는 모양은 그대로 디코딩되지 않는다.
   * Option은 이 값을 읽어 들이는 자리에서 씌운다.
   */
  settings: Schema.NullOr(BookSettings).pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
})
/** {@linkcode BookProgress} 스키마의 디코딩된 값. */
export type BookProgress = typeof BookProgress.Type

/** 페이지 한 장. 이미지 바이트는 `load()`로 필요할 때 가져온다. */
export interface Page {
  /** 아카이브 안에서의 이름. 페이지 순서를 정하는 데 쓴다. */
  readonly name: string
  /** 이미지의 object URL을 만들고 캐시한다. */
  load(): Effect.Effect<string, ArchiveError>
  /** 캐시해 둔 object URL을 놓아 메모리를 돌려준다. */
  unload(): void
  /**
   * 이미지 헤더를 읽어 픽셀 크기를 잰다. 임포트할 때 한 번 부르고, 그 답은
   * 책 레코드에 남는다. 형식을 알아보지 못하면 실패가 아니라 `None`이다.
   */
  measure(): Effect.Effect<Option.Option<ImageSize>, ArchiveError>
}

/**
 * 열려 있는 책. 아카이브는 페이지 목록을 알 만큼 읽었지만, 이미지는 여전히
 * {@linkcode Page.load}로 한 장씩 가져온다.
 */
export interface LoadedBook {
  /** 고정된 정체. 책장과 진행 상태를 저장하는 키이기도 하다. */
  readonly id: string
  /** 책장과 리더 헤더가 이 책을 부르는 이름. */
  readonly title: string
  /** 페이지가 어디서 왔는지. */
  readonly source: BookSource
  /** 모든 페이지, 읽는 순서대로. */
  readonly pages: Page[]
  /**
   * 임포트할 때 재어 둔 페이지별 크기. {@linkcode LoadedBook.pages}와 번호가
   * 맞물린다. 재기 전에 들여온 책이나 형식을 알아보지 못한 페이지는 `None`이다.
   */
  readonly pageSizes: ReadonlyArray<Option.Option<ImageSize>>
}
