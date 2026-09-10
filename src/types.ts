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
})
/** {@linkcode Settings} 스키마의 디코딩된 값. */
export type Settings = typeof Settings.Type

/**
 * 아무것도 바꾼 적 없는 사람이 받는 설정. 만화 순서, 한 번에 한 장, 통째로
 * 맞춤, 어두운 테마, 표지는 혼자.
 */
export const defaultSettings: Settings = DEFAULTS

/** 책마다 저장되는 읽기 상태. */
export const BookProgress = Schema.Struct({
  page: Schema.Number,
  bookmarks: Schema.Array(Schema.Number),
  updatedAt: Schema.Number,
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
