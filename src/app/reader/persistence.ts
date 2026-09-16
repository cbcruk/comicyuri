/**
 * 리더가 저장소와 책장에 닿는 길. 전역 설정, 이 책의 설정과 진행 상태, 책장에서 이웃한
 * 책이다.
 *
 * Foldkit에서는 이 넷이 애플리케이션의 몫이었다. 리더가 OutMessage를 올려 보내면 위에서
 * `SaveSettings`·`SaveBookSettings`·`SaveProgress`·`Book.neighbour`로 풀었다. 리더 화면이
 * 스스로 서는 지금은 그 자리가 여기다.
 *
 * 저장 자체는 `src/app/state/`가 맡는다. 여기 남은 것은 리더가 바라는 모양
 * ({@linkcode ReaderPersistence})으로 묶어 주는 일뿐이고, 그 덕에 화면 테스트가 가짜를
 * 끼워 넣을 수 있다.
 */

import type { Effect, Option } from 'effect'
import type { Atom } from 'effect/unstable/reactivity'

import {
  bookSettingsFor,
  neighbourBookId,
  progressFor,
  saveProgress,
  settingsAtom,
  writeBookSettings,
} from '../state/index.ts'
import type { BookProgress, BookSettings, PageMark, Rotation, Settings } from '../../types.ts'

/**
 * 리더가 저장하는 진행 상태. `UpdatedProgress`가 지고 오는 넷이다.
 *
 * 이 책에만 걸린 설정은 여기 없다. 페이지를 넘기는 것과 설정을 바꾸는 것은 서로 다른
 * 때에 일어나므로, 저장하는 쪽이 이미 적혀 있는 것을 지고 다시 쓴다(`P-302`).
 */
export type ReaderProgress = Readonly<{
  page: number
  bookmarks: ReadonlyArray<number>
  marks: ReadonlyArray<PageMark>
  rotation: Rotation
}>

/** 리더 화면이 저장소에 바라는 것 전부. */
export type ReaderPersistence = Readonly<{
  /** 전역 기본값. 여기에 쓰면 저장된다(`P-303`). */
  settingsAtom: Atom.Writable<Settings>
  /** 이 책에만 걸린 설정. 한 번도 정한 적 없으면 없음이다(`R-2B3`). */
  bookSettingsFor: (bookId: string) => Atom.Atom<Option.Option<BookSettings>>
  /** 이 책을 어디까지 읽었는지. 한 번도 연 적 없으면 없음이다(`P-302`). */
  progressFor: (bookId: string) => Atom.Atom<Option.Option<BookProgress>>
  saveProgress: (bookId: string, progress: ReaderProgress) => Effect.Effect<void>
  saveBookSettings: (
    bookId: string,
    maybeSettings: Option.Option<BookSettings>,
  ) => Effect.Effect<void>
  /**
   * 책장 순서에서 이웃한 책(`R-216`). 앞으로 한 칸이면 `step`이 `1`이다.
   *
   * 책장의 끝이면 없음이다. 그때 리더는 제자리에 머문다 — 순서를 모르는 채로 짐작해
   * 여는 것보다 낫다.
   */
  neighbourBookId: (bookId: string, step: number) => Effect.Effect<Option.Option<string>>
}>

/** 브라우저의 저장소에 닿는 한 벌. 앱이 이것을 쓴다. */
export const browserPersistence: ReaderPersistence = {
  settingsAtom,
  bookSettingsFor,
  progressFor,
  saveProgress,
  saveBookSettings: writeBookSettings,
  neighbourBookId,
}
