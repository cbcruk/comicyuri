/**
 * 전역 기본값과 책별 덮어쓰기, 두 층을 다루는 자리.
 *
 * 리더가 쥐고 있는 것은 언제나 두 층을 합친 결과다. 저장할 때 다시 갈라야
 * 하는데, 그 두 방향이 서로의 역이 아니면 설정이 조용히 새어 나간다 — 어떤
 * 책에서 바꾼 방향이 전역 기본값을 덮어써서 다음에 여는 책까지 따라가는 식으로.
 * 그래서 합치는 쪽과 가르는 쪽을 한 파일에 둔다.
 */

import { Option } from 'effect'

import type { BookSettings, Settings } from '../types.ts'

/** 책을 열 때 어디에 걸고, 저장된 자리를 권할지. */
export type Opening = Readonly<{
  /** 리더가 처음 걸 페이지. */
  page: number
  /** 이리로 갈지 물어볼 페이지. 묻지 않기로 했으면 없음이다. */
  maybeOffer: Option.Option<number>
}>

/**
 * 저장된 자리를 가진 책을 어디에 걸지 정한다.
 *
 * 첫 장에 멈춰 있던 책은 물을 것이 없다 — 이미 그 자리이므로, `ask`여도 묻지
 * 않고 조용히 연다.
 *
 * @param saved 이 책에 저장되어 있는 페이지.
 */
export const opening = (settings: Settings, saved: number): Opening => {
  if (settings.resume === 'continue') return { page: saved, maybeOffer: Option.none() }
  if (settings.resume === 'restart') return { page: 0, maybeOffer: Option.none() }
  return { page: 0, maybeOffer: saved > 0 ? Option.some(saved) : Option.none() }
}

/** 합쳐진 설정에서 책에 남길 몫만 떼어 낸다. */
export const bookPartOf = (settings: Settings): BookSettings => ({
  direction: settings.direction,
  view: settings.view,
  fit: settings.fit,
  coverAlone: settings.coverAlone,
  singleThreshold: settings.singleThreshold,
  enlargeToFit: settings.enlargeToFit,
  splitWide: settings.splitWide,
})

/**
 * 이 책을 열 때 리더가 받을 설정.
 *
 * 기억이 꺼져 있으면 전역 기본값 그대로다. 책에 남은 것이 있어도 쓰지 않으므로,
 * 스위치를 껐다 켜는 것만으로 예전에 정해 둔 배치가 돌아온다.
 */
export const forBook = (global: Settings, maybeBook: Option.Option<BookSettings>): Settings =>
  global.rememberBookSettings
    ? Option.match(maybeBook, {
        onNone: () => global,
        onSome: (book) => ({ ...global, ...book }),
      })
    : global

/** 바뀐 설정을 저장할 두 자리로 가른 결과. */
export type Split = Readonly<{
  /** `comicyuri:settings`에 쓸 것. */
  global: Settings
  /** 이 책의 레코드에 쓸 것. 기억이 꺼져 있으면 없음이다. */
  maybeBook: Option.Option<BookSettings>
}>

/**
 * 리더가 올려 보낸 설정을 전역과 책별로 가른다.
 *
 * 기억이 켜져 있으면 책의 생김새를 따르는 몫은 책으로 가고, 전역 기본값의 그
 * 자리는 건드리지 않는다. 그러지 않으면 어떤 책에서 방향을 뒤집은 것이 전역
 * 기본값이 되어 다음에 여는 책까지 따라간다.
 *
 * @param previous 지금 저장되어 있는 전역 설정.
 * @param next 리더가 쥐고 있는, 두 층이 합쳐진 설정.
 */
export const split = (previous: Settings, next: Settings): Split =>
  next.rememberBookSettings
    ? {
        global: { ...next, ...bookPartOf(previous) },
        maybeBook: Option.some(bookPartOf(next)),
      }
    : { global: next, maybeBook: Option.none() }
