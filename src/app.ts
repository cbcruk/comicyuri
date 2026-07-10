import type { Book, Settings } from './types.ts'
import type { StoredBook } from './db.ts'
import { deleteBook, getAllBooks, putBook } from './db.ts'
import { bookFromStored, storedBooksFromFiles } from './loader.ts'
import { loadProgress, loadSettings, saveProgress, saveSettings } from './storage.ts'
import { makeCover } from './thumbnail.ts'
import { Library } from './library.ts'
import { Viewer } from './viewer.ts'

export class App {
  private settings: Settings
  private readonly library: Library
  private readonly viewer: Viewer
  private activeBookId: string | null = null
  private saveTimer = 0
  private pending: { page: number; bookmarks: number[] } | null = null

  constructor(root: HTMLElement) {
    this.settings = loadSettings()
    this.applyTheme()

    this.library = new Library(root, {
      onOpen: (id) => void this.openBook(id),
      onDelete: (id) => void this.removeBook(id),
      onImport: (files) => void this.importFiles(files),
      onToggleTheme: () => this.toggleTheme(),
    })

    this.viewer = new Viewer(root, {
      getSettings: () => this.settings,
      setSettings: (next) => {
        this.settings = next
        saveSettings(next)
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

  async start(): Promise<void> {
    await this.refreshShelf()
  }

  private async refreshShelf(): Promise<void> {
    const books = await getAllBooks()
    this.library.render(books)
  }

  private async importFiles(files: File[]): Promise<void> {
    this.library.setBusy('Importing…')
    try {
      const records = storedBooksFromFiles(files)
      for (const record of records) {
        await this.enrich(record)
        await putBook(record)
      }
      await this.refreshShelf()
    } catch (err) {
      this.library.setBusy(err instanceof Error ? err.message : 'Import failed')
      setTimeout(() => this.library.setBusy(null), 4000)
      return
    }
    this.library.setBusy(null)
  }

  /** Open the book once to validate it, count pages and snapshot a cover. */
  private async enrich(record: StoredBook): Promise<void> {
    const book = await bookFromStored(record)
    record.pageCount = book.pages.length
    const first = book.pages[0]
    if (first) {
      const url = await first.load()
      record.cover = await makeCover(url)
      first.unload()
    }
  }

  private async openBook(id: string): Promise<void> {
    const stored = (await getAllBooks()).find((b) => b.id === id)
    if (!stored) return
    this.library.setBusy('Opening…')
    let book: Book
    try {
      book = await bookFromStored(stored)
    } catch (err) {
      this.library.setBusy(err instanceof Error ? err.message : 'Could not open book')
      setTimeout(() => this.library.setBusy(null), 4000)
      return
    }
    this.library.setBusy(null)
    this.activeBookId = id
    const progress = loadProgress(id)
    this.library.hide()
    this.viewer.open(book, progress.page, progress.bookmarks)
  }

  private exitViewer(): void {
    this.flushProgress()
    this.viewer.close()
    this.activeBookId = null
    this.library.show()
    void this.refreshShelf()
  }

  private async removeBook(id: string): Promise<void> {
    await deleteBook(id)
    await this.refreshShelf()
  }

  private persistProgress(page: number, bookmarks: number[]): void {
    if (!this.activeBookId) return
    this.pending = { page, bookmarks }
    window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => this.flushProgress(), 400)
  }

  /** Write any debounced progress immediately (e.g. on exit or page hide). */
  private flushProgress(): void {
    window.clearTimeout(this.saveTimer)
    if (this.activeBookId && this.pending) {
      saveProgress(this.activeBookId, { ...this.pending, updatedAt: 0 })
    }
    this.pending = null
  }

  private toggleTheme(): void {
    this.settings = { ...this.settings, theme: this.settings.theme === 'dark' ? 'light' : 'dark' }
    saveSettings(this.settings)
    this.applyTheme()
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.settings.theme
  }
}
