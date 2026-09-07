import { Effect } from 'effect'
import type { Settings } from './types.ts'
import type { StoredBook } from './db.ts'
import { deleteBook, getAllBooks, putBook } from './db.ts'
import { describe } from './errors.ts'
import type { AppError } from './errors.ts'
import { bookFromStored, storedBooksFromFiles } from './loader.ts'
import { loadProgress, loadSettings, saveProgress, saveSettings } from './storage.ts'
import { makeCover } from './thumbnail.ts'
import { Library } from './library.ts'
import { Viewer } from './viewer.ts'

const ERROR_LINGER = '4 seconds'

/**
 * Wires the shelf and the reader together.
 *
 * Everything that can fail is an `Effect` down to the DOM boundary, where a
 * handler either forks it (`run`) or — for the synchronous, must-not-be-lost
 * writes on `pagehide` — runs it with `Effect.runSync`.
 */
export class App {
  private settings: Settings
  private readonly library: Library
  private readonly viewer: Viewer
  private activeBookId: string | null = null
  private saveTimer = 0
  private pending: { page: number; bookmarks: number[] } | null = null

  /** Settings have to be read before the first paint, hence the Effect. */
  static make(root: HTMLElement): Effect.Effect<App> {
    return Effect.map(loadSettings, (settings) => new App(root, settings))
  }

  private constructor(root: HTMLElement, settings: Settings) {
    this.settings = settings
    this.applyTheme()

    this.library = new Library(root, {
      onOpen: (id) => this.run(this.openBook(id)),
      onDelete: (id) => this.run(this.removeBook(id)),
      onImport: (files) => this.run(this.importFiles(files)),
      onToggleTheme: () => this.toggleTheme(),
    })

    this.viewer = new Viewer(root, {
      getSettings: () => this.settings,
      setSettings: (next) => {
        this.settings = next
        Effect.runSync(saveSettings(next))
        this.applyTheme()
      },
      onProgress: (page, bookmarks) => this.persistProgress(page, bookmarks),
      onExit: () => this.exitViewer(),
    })

    // Don't lose the last page if the tab is closed or reloaded mid-read.
    window.addEventListener('pagehide', () => this.flushProgress())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushProgress()
    })
  }

  start(): Effect.Effect<void> {
    return this.guard(this.refreshShelf())
  }

  /** Launch a fully-handled effect from a DOM event handler. */
  private run(effect: Effect.Effect<void>): void {
    Effect.runFork(effect)
  }

  /** Surface a failure on the shelf status line, then clear it. */
  private guard(effect: Effect.Effect<void, AppError>): Effect.Effect<void> {
    return effect.pipe(
      Effect.catch((error) =>
        Effect.sync(() => this.library.setBusy(describe(error))).pipe(
          Effect.andThen(Effect.sleep(ERROR_LINGER)),
          Effect.andThen(Effect.sync(() => this.library.setBusy(null))),
        ),
      ),
    )
  }

  private refreshShelf(): Effect.Effect<void, AppError> {
    return Effect.gen({ self: this }, function* () {
      const books = yield* getAllBooks
      this.library.render(books)
    })
  }

  private importFiles(files: File[]): Effect.Effect<void> {
    return this.guard(
      Effect.gen({ self: this }, function* () {
        this.library.setBusy('Importing…')
        const records = yield* storedBooksFromFiles(files)
        yield* Effect.forEach(records, (record) => this.importOne(record), { discard: true })
        yield* this.refreshShelf()
        this.library.setBusy(null)
      }),
    )
  }

  /** Open the book once to validate it, count pages and snapshot a cover. */
  private importOne(record: StoredBook): Effect.Effect<void, AppError> {
    return Effect.gen({ self: this }, function* () {
      const book = yield* bookFromStored(record)
      record.pageCount = book.pages.length
      const first = book.pages[0]
      if (first) {
        const url = yield* first.load()
        // A missing cover is cosmetic; the object URL is released either way.
        record.cover = yield* makeCover(url).pipe(
          Effect.ensuring(Effect.sync(() => first.unload())),
          Effect.orElseSucceed(() => undefined),
        )
      }
      yield* putBook(record)
    })
  }

  private openBook(id: string): Effect.Effect<void> {
    return this.guard(
      Effect.gen({ self: this }, function* () {
        const stored = (yield* getAllBooks).find((b) => b.id === id)
        if (!stored) return
        this.library.setBusy('Opening…')
        const book = yield* bookFromStored(stored)
        const progress = yield* loadProgress(id)
        this.library.setBusy(null)
        this.activeBookId = id
        this.library.hide()
        this.viewer.open(book, progress.page, progress.bookmarks)
      }),
    )
  }

  private removeBook(id: string): Effect.Effect<void> {
    return this.guard(deleteBook(id).pipe(Effect.andThen(this.refreshShelf())))
  }

  private exitViewer(): void {
    this.flushProgress()
    this.viewer.close()
    this.activeBookId = null
    this.library.show()
    this.run(this.guard(this.refreshShelf()))
  }

  private persistProgress(page: number, bookmarks: number[]): void {
    if (!this.activeBookId) return
    this.pending = { page, bookmarks }
    window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => this.flushProgress(), 400)
  }

  /**
   * Write any debounced progress immediately (e.g. on exit or page hide).
   * `runSync` rather than a forked fiber: the tab may not be alive long enough
   * to schedule anything.
   */
  private flushProgress(): void {
    window.clearTimeout(this.saveTimer)
    if (this.activeBookId && this.pending) {
      Effect.runSync(saveProgress(this.activeBookId, { ...this.pending, updatedAt: 0 }))
    }
    this.pending = null
  }

  private toggleTheme(): void {
    this.settings = { ...this.settings, theme: this.settings.theme === 'dark' ? 'light' : 'dark' }
    Effect.runSync(saveSettings(this.settings))
    this.applyTheme()
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.settings.theme
  }
}
