/**
 * 설정과 책별 진행 상태를 담아 두는 `localStorage` 사본.
 *
 * 읽기는 둘 다 스키마를 통해 디코딩한다. 그래서 깨졌거나 오래된 항목은 그 JSON이
 * UI로 흘러드는 대신 기본값으로 물러난다. 쓰기는 최선을 다할 뿐이다 — 저장소가
 * 없거나(시크릿 모드) 꽉 찰 수 있고, 둘 다 읽는 사람을 멈춰 세울 일은 아니다.
 */

import { Effect, Schema } from 'effect'
import { BookProgress, defaultSettings, Settings } from './types.ts'

export { defaultSettings }

const SETTINGS_KEY = 'comicyuri:settings'
const PROGRESS_PREFIX = 'comicyuri:progress:'

const emptyProgress: BookProgress = { page: 0, bookmarks: [], updatedAt: 0 }

const SettingsJson = Schema.fromJsonString(Settings)
const decodeSettings = Schema.decodeUnknownSync(SettingsJson)
const encodeSettings = Schema.encodeSync(SettingsJson)

const ProgressJson = Schema.fromJsonString(BookProgress)
const decodeProgress = Schema.decodeUnknownSync(ProgressJson)
const encodeProgress = Schema.encodeSync(ProgressJson)

/**
 * 저장된 설정을 읽는다. 저장된 것이 없거나 더 이상 디코딩되지 않으면
 * {@linkcode defaultSettings}로 물러난다.
 */
export const loadSettings: Effect.Effect<Settings> = Effect.try(() =>
  decodeSettings(localStorage.getItem(SETTINGS_KEY)),
).pipe(Effect.orElseSucceed(() => ({ ...defaultSettings })))

/**
 * 설정을 쓴다. 저장에 실패해도 삼킨다 — 이번 세션에서 읽는 사람이 잃는 것은
 * 없다.
 */
export const saveSettings = (settings: Settings): Effect.Effect<void> =>
  Effect.try(() => localStorage.setItem(SETTINGS_KEY, encodeSettings(settings))).pipe(Effect.ignore)

/**
 * 책을 어디까지 읽었는지 읽어 온다. 한 번도 연 적 없는 책은 0페이지에 북마크
 * 없음으로 답한다.
 */
export const loadProgress = (bookId: string): Effect.Effect<BookProgress> =>
  Effect.try(() => decodeProgress(localStorage.getItem(PROGRESS_PREFIX + bookId))).pipe(
    Effect.orElseSucceed(() => emptyProgress),
  )

/** 책을 어디까지 읽었는지 지금 시각을 찍어 저장한다. */
export const saveProgress = (bookId: string, progress: BookProgress): Effect.Effect<void> =>
  Effect.try(() =>
    localStorage.setItem(
      PROGRESS_PREFIX + bookId,
      encodeProgress({ ...progress, updatedAt: Date.now() }),
    ),
  ).pipe(Effect.ignore)
