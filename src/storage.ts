/**
 * `localStorage` mirrors of the settings and per-book progress.
 *
 * Both reads decode through a schema, so a corrupt or stale entry degrades to
 * the defaults instead of poisoning the UI with whatever JSON happened to be
 * there. Writes are best-effort: storage may be unavailable (private mode) or
 * full, and neither is worth interrupting the reader for.
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

export const loadSettings: Effect.Effect<Settings> = Effect.try(() =>
  decodeSettings(localStorage.getItem(SETTINGS_KEY)),
).pipe(Effect.orElseSucceed(() => ({ ...defaultSettings })))

export const saveSettings = (settings: Settings): Effect.Effect<void> =>
  Effect.try(() => localStorage.setItem(SETTINGS_KEY, encodeSettings(settings))).pipe(Effect.ignore)

export const loadProgress = (bookId: string): Effect.Effect<BookProgress> =>
  Effect.try(() => decodeProgress(localStorage.getItem(PROGRESS_PREFIX + bookId))).pipe(
    Effect.orElseSucceed(() => emptyProgress),
  )

export const saveProgress = (bookId: string, progress: BookProgress): Effect.Effect<void> =>
  Effect.try(() =>
    localStorage.setItem(
      PROGRESS_PREFIX + bookId,
      encodeProgress({ ...progress, updatedAt: Date.now() }),
    ),
  ).pipe(Effect.ignore)
