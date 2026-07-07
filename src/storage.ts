import type { BookProgress, Settings } from './types.ts'

const SETTINGS_KEY = 'comicyuri:settings'
const PROGRESS_PREFIX = 'comicyuri:progress:'

export const defaultSettings: Settings = {
  direction: 'rtl',
  view: 'single',
  fit: 'contain',
  theme: 'dark',
  coverAlone: true,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...defaultSettings }
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* storage may be unavailable (private mode); ignore */
  }
}

export function loadProgress(bookId: string): BookProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_PREFIX + bookId)
    if (raw) return JSON.parse(raw) as BookProgress
  } catch {
    /* ignore */
  }
  return { page: 0, bookmarks: [], updatedAt: 0 }
}

export function saveProgress(bookId: string, progress: BookProgress): void {
  try {
    localStorage.setItem(
      PROGRESS_PREFIX + bookId,
      JSON.stringify({ ...progress, updatedAt: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}
