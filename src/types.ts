export type ReadingDirection = 'rtl' | 'ltr'
export type ViewMode = 'single' | 'spread'
export type FitMode = 'contain' | 'width' | 'height' | 'original'
export type Theme = 'dark' | 'light'

export type BookSource = 'zip' | 'images' | 'folder'

/** A single page. The image bytes are resolved lazily via `load()`. */
export interface Page {
  readonly name: string
  /** Resolve (and cache) an object URL for the image. */
  load(): Promise<string>
  /** Release the cached object URL to free memory. */
  unload(): void
}

export interface Book {
  readonly id: string
  readonly title: string
  readonly source: BookSource
  readonly pages: Page[]
}

/** Persisted per-book reading state. */
export interface BookProgress {
  page: number
  bookmarks: number[]
  updatedAt: number
}

export interface Settings {
  direction: ReadingDirection
  view: ViewMode
  fit: FitMode
  theme: Theme
  /** Show the very first page on its own (cover) in spread mode. */
  coverAlone: boolean
}
