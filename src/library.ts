import type { StoredBook } from './db.ts'

export interface LibraryHost {
  onOpen(id: string): void
  onDelete(id: string): void
  onImport(files: File[]): void
  onToggleTheme(): void
}

export class Library {
  private readonly el: HTMLElement
  private readonly grid: HTMLElement
  private readonly status: HTMLElement
  private readonly fileInput: HTMLInputElement
  private readonly dirInput: HTMLInputElement
  private coverUrls: string[] = []
  private readonly host: LibraryHost

  constructor(root: HTMLElement, host: LibraryHost) {
    this.host = host
    this.el = document.createElement('div')
    this.el.className = 'library'
    this.el.innerHTML = TEMPLATE
    root.appendChild(this.el)

    this.grid = this.q('.library__grid')
    this.status = this.q('.library__status')
    this.fileInput = this.q('[data-input="files"]') as HTMLInputElement
    this.dirInput = this.q('[data-input="dir"]') as HTMLInputElement

    this.wire()
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.el.querySelector(sel) as T
  }

  show(): void {
    this.el.hidden = false
  }
  hide(): void {
    this.el.hidden = true
  }

  setBusy(message: string | null): void {
    this.status.textContent = message ?? ''
    this.status.hidden = !message
  }

  render(books: StoredBook[]): void {
    this.coverUrls.forEach((u) => URL.revokeObjectURL(u))
    this.coverUrls = []
    this.grid.innerHTML = ''
    this.q('.library__empty').hidden = books.length > 0

    for (const book of books) {
      const card = document.createElement('div')
      card.className = 'card'
      let coverHtml = '<div class="card__cover card__cover--blank">📖</div>'
      if (book.cover) {
        const url = URL.createObjectURL(book.cover)
        this.coverUrls.push(url)
        coverHtml = `<div class="card__cover"><img src="${url}" alt="" /></div>`
      }
      card.innerHTML = `
        <button class="card__open" data-open="${book.id}">
          ${coverHtml}
        </button>
        <div class="card__meta">
          <span class="card__title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</span>
          <span class="card__pages">${book.pageCount ?? '?'} pages</span>
        </div>
        <button class="card__del" data-del="${book.id}" title="Remove from shelf">🗑</button>
      `
      this.grid.appendChild(card)
    }
  }

  private wire(): void {
    this.el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const open = target.closest('[data-open]') as HTMLElement | null
      if (open) return this.host.onOpen(open.dataset.open!)
      const del = target.closest('[data-del]') as HTMLElement | null
      if (del) return this.host.onDelete(del.dataset.del!)
    })

    this.q('[data-act="pick-files"]').addEventListener('click', () => this.fileInput.click())
    this.q('[data-act="pick-dir"]').addEventListener('click', () => this.dirInput.click())
    this.q('[data-act="theme"]').addEventListener('click', () => this.host.onToggleTheme())

    const consume = (input: HTMLInputElement) => {
      const files = input.files ? [...input.files] : []
      input.value = ''
      if (files.length) this.host.onImport(files)
    }
    this.fileInput.addEventListener('change', () => consume(this.fileInput))
    this.dirInput.addEventListener('change', () => consume(this.dirInput))

    const drop = this.q('.library__drop')
    const stop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    ;['dragenter', 'dragover'].forEach((ev) =>
      this.el.addEventListener(ev, (e) => {
        stop(e as DragEvent)
        drop.classList.add('is-over')
      }),
    )
    ;['dragleave', 'drop'].forEach((ev) =>
      this.el.addEventListener(ev, (e) => {
        stop(e as DragEvent)
        drop.classList.remove('is-over')
      }),
    )
    this.el.addEventListener('drop', (e) => {
      const files = (e as DragEvent).dataTransfer?.files
      if (files?.length) this.host.onImport([...files])
    })
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  )
}

const TEMPLATE = /* html */ `
  <header class="library__top">
    <h1 class="library__brand">comic<span>yuri</span></h1>
    <div class="library__actions">
      <button class="btn btn--primary" data-act="pick-files">Open files</button>
      <button class="btn" data-act="pick-dir">Open folder</button>
      <button class="btn" data-act="theme" title="Toggle theme">◐</button>
    </div>
    <input type="file" data-input="files" accept=".cbz,.zip,image/*" multiple hidden />
    <input type="file" data-input="dir" webkitdirectory hidden />
  </header>

  <p class="library__status" hidden></p>

  <div class="library__drop">
    <section class="library__grid"></section>
    <div class="library__empty">
      <p class="library__empty-title">Your shelf is empty</p>
      <p>Open <strong>.cbz / .zip</strong> archives, image files, or a folder — or drop them here.</p>
      <p class="library__hint">Files stay in your browser. Reading progress and bookmarks are remembered.</p>
    </div>
  </div>
`
