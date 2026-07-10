import type { Book, FitMode, Settings } from './types.ts'
import { buildSpreads, spreadOfPage } from './spreads.ts'

export interface ViewerHost {
  getSettings(): Settings
  setSettings(next: Settings): void
  onProgress(page: number, bookmarks: number[]): void
  onExit(): void
}

const PRELOAD = 1 // spreads to preload on each side
const KEEP = 3 // spreads to keep loaded on each side (rest are unloaded)
const TAP_SLOP = 10 // px of movement still counted as a tap
const SWIPE_MIN = 45 // px before a drag becomes a page turn

const FIT_LABEL: Record<FitMode, string> = {
  contain: 'Fit',
  width: 'Width',
  height: 'Height',
  original: '1:1',
}
const FIT_ORDER: FitMode[] = ['contain', 'width', 'height', 'original']

export class Viewer {
  private readonly el: HTMLElement
  private book!: Book
  private spreads: number[][] = []
  private index = 0
  private bookmarks = new Set<number>()

  private zoom = 1
  private panX = 0
  private panY = 0
  private uiVisible = true
  private hideTimer = 0

  private readonly slots: HTMLImageElement[]
  private readonly canvas: HTMLElement
  private readonly stage: HTMLElement
  private readonly counter: HTMLElement
  private readonly slider: HTMLInputElement
  private readonly titleEl: HTMLElement
  private readonly bookmarkBtn: HTMLButtonElement
  private readonly thumbs: HTMLElement
  private thumbsBuilt = false
  private readonly host: ViewerHost

  constructor(root: HTMLElement, host: ViewerHost) {
    this.host = host
    this.el = document.createElement('div')
    this.el.className = 'reader'
    this.el.hidden = true
    this.el.innerHTML = TEMPLATE
    root.appendChild(this.el)

    this.stage = this.q('.reader__stage')
    this.canvas = this.q('.reader__canvas')
    this.slots = [this.q('[data-slot="0"]'), this.q('[data-slot="1"]')] as HTMLImageElement[]
    this.counter = this.q('.reader__counter')
    this.slider = this.q('.reader__slider') as HTMLInputElement
    this.titleEl = this.q('.reader__title')
    this.bookmarkBtn = this.q('[data-act="bookmark"]') as HTMLButtonElement
    this.thumbs = this.q('.reader__thumbs')

    this.wire()
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.el.querySelector(sel) as T
  }

  open(book: Book, startPage: number, bookmarks: number[]): void {
    this.book = book
    this.bookmarks = new Set(bookmarks)
    this.titleEl.textContent = book.title
    this.slider.max = String(book.pages.length - 1)
    this.applySettings()
    this.rebuildSpreads(startPage)
    this.thumbsBuilt = false
    this.thumbs.hidden = true
    this.el.hidden = false
    this.showUi()
    document.body.classList.add('reading')
  }

  close(): void {
    this.book?.pages.forEach((p) => p.unload())
    this.el.hidden = true
    document.body.classList.remove('reading')
  }

  // --- settings / layout -------------------------------------------------

  private applySettings(): void {
    const s = this.host.getSettings()
    this.el.dataset.dir = s.direction
    this.el.dataset.view = s.view
    this.el.dataset.fit = s.fit
    this.q('[data-act="dir"]').textContent = s.direction === 'rtl' ? 'RTL' : 'LTR'
    this.q('[data-act="view"]').textContent = s.view === 'spread' ? 'Two' : 'One'
    this.q('[data-act="fit"]').textContent = FIT_LABEL[s.fit]
  }

  private rebuildSpreads(keepPage: number): void {
    const s = this.host.getSettings()
    this.spreads = buildSpreads(this.book.pages.length, s.view, s.coverAlone)
    this.index = spreadOfPage(this.spreads, keepPage)
    void this.render()
  }

  private mutate(patch: Partial<Settings>): void {
    const page = this.currentPage
    this.host.setSettings({ ...this.host.getSettings(), ...patch })
    this.applySettings()
    this.rebuildSpreads(page)
  }

  // --- navigation --------------------------------------------------------

  private get currentPage(): number {
    return this.spreads[this.index]?.[0] ?? 0
  }

  private go(delta: number): void {
    const next = this.index + delta
    if (next < 0 || next >= this.spreads.length) return
    this.index = next
    this.resetZoom()
    void this.render()
  }
  private forward(): void {
    this.go(1)
  }
  private backward(): void {
    this.go(-1)
  }
  private tapLeft(): void {
    if (this.host.getSettings().direction === 'rtl') this.forward()
    else this.backward()
  }
  private tapRight(): void {
    if (this.host.getSettings().direction === 'rtl') this.backward()
    else this.forward()
  }
  private jumpToPage(page: number): void {
    this.index = spreadOfPage(this.spreads, Math.max(0, Math.min(page, this.book.pages.length - 1)))
    this.resetZoom()
    void this.render()
  }

  // --- rendering ---------------------------------------------------------

  private async render(): Promise<void> {
    const pages = this.spreads[this.index] ?? [0]
    for (let slot = 0; slot < 2; slot++) {
      const img = this.slots[slot]!
      const pageIdx = pages[slot]
      if (pageIdx === undefined) {
        img.hidden = true
        img.removeAttribute('src')
        continue
      }
      img.hidden = false
      try {
        img.src = await this.book.pages[pageIdx]!.load()
      } catch (err) {
        img.hidden = true
        console.error(err)
      }
    }
    this.updateChrome()
    this.preload()
    this.host.onProgress(
      this.currentPage,
      [...this.bookmarks].sort((a, b) => a - b),
    )
  }

  private updateChrome(): void {
    const first = this.currentPage
    const last = this.spreads[this.index]?.at(-1) ?? first
    const label = first === last ? `${first + 1}` : `${first + 1}–${last + 1}`
    this.counter.textContent = `${label} / ${this.book.pages.length}`
    this.slider.value = String(first)
    this.bookmarkBtn.classList.toggle('is-on', this.bookmarks.has(first))
    this.bookmarkBtn.setAttribute('aria-pressed', String(this.bookmarks.has(first)))
  }

  private preload(): void {
    const near = new Set<number>()
    for (let d = -KEEP; d <= KEEP; d++) {
      this.spreads[this.index + d]?.forEach((p) => near.add(p))
    }
    // Warm the immediate neighbours.
    for (let d = -PRELOAD; d <= PRELOAD; d++) {
      this.spreads[this.index + d]?.forEach((p) => void this.book.pages[p]?.load())
    }
    // Release anything far away.
    this.book.pages.forEach((p, i) => {
      if (!near.has(i)) p.unload()
    })
  }

  // --- zoom / pan --------------------------------------------------------

  private resetZoom(): void {
    this.zoom = 1
    this.panX = 0
    this.panY = 0
    this.applyTransform()
  }
  private setZoom(z: number): void {
    this.zoom = Math.max(1, Math.min(6, z))
    if (this.zoom === 1) {
      this.panX = 0
      this.panY = 0
    }
    this.applyTransform()
  }
  private applyTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`
    this.el.classList.toggle('is-zoomed', this.zoom > 1)
  }

  // --- ui visibility -----------------------------------------------------

  private showUi(): void {
    this.uiVisible = true
    this.el.classList.remove('is-immersive')
    window.clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => this.hideUi(), 3500)
  }
  private hideUi(): void {
    if (!this.thumbs.hidden) return
    this.uiVisible = false
    this.el.classList.add('is-immersive')
  }
  private toggleUi(): void {
    if (this.uiVisible) this.hideUi()
    else this.showUi()
  }

  private toggleThumbs(): void {
    if (this.thumbs.hidden) {
      this.buildThumbs()
      this.thumbs.hidden = false
      this.showUi()
    } else {
      this.thumbs.hidden = true
    }
  }

  private buildThumbs(): void {
    if (this.thumbsBuilt) return
    this.thumbsBuilt = true
    const grid = this.q('.reader__thumbs-grid')
    grid.innerHTML = ''
    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const cell = e.target as HTMLElement
        const i = Number(cell.dataset.page)
        const img = cell.querySelector('img')!
        void this.book.pages[i]?.load().then((url) => (img.src = url))
        obs.unobserve(cell)
      }
    })
    this.book.pages.forEach((page, i) => {
      const cell = document.createElement('button')
      cell.className = 'reader__thumb'
      cell.dataset.page = String(i)
      cell.classList.toggle('is-bookmark', this.bookmarks.has(i))
      cell.innerHTML = `<img alt="" loading="lazy" /><span>${i + 1}</span>`
      cell.title = page.name
      cell.addEventListener('click', () => {
        this.jumpToPage(i)
        this.thumbs.hidden = true
        this.showUi()
      })
      grid.appendChild(cell)
      io.observe(cell)
    })
  }

  private toggleBookmark(): void {
    const p = this.currentPage
    if (this.bookmarks.has(p)) this.bookmarks.delete(p)
    else this.bookmarks.add(p)
    this.updateChrome()
    this.host.onProgress(
      this.currentPage,
      [...this.bookmarks].sort((a, b) => a - b),
    )
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await this.el.requestFullscreen()
    } catch {
      /* not permitted; ignore */
    }
  }

  // --- input wiring ------------------------------------------------------

  private wire(): void {
    // Toolbar buttons via delegation.
    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null
      if (!btn) return
      const act = btn.dataset.act
      const s = this.host.getSettings()
      switch (act) {
        case 'exit':
          this.host.onExit()
          break
        case 'dir':
          this.mutate({ direction: s.direction === 'rtl' ? 'ltr' : 'rtl' })
          break
        case 'view':
          this.mutate({ view: s.view === 'spread' ? 'single' : 'spread' })
          break
        case 'fit':
          this.mutate({ fit: FIT_ORDER[(FIT_ORDER.indexOf(s.fit) + 1) % FIT_ORDER.length]! })
          break
        case 'thumbs':
          this.toggleThumbs()
          break
        case 'bookmark':
          this.toggleBookmark()
          break
        case 'fullscreen':
          void this.toggleFullscreen()
          break
        case 'zoom-in':
          this.setZoom(this.zoom + 0.5)
          break
        case 'zoom-out':
          this.setZoom(this.zoom - 0.5)
          break
      }
    })

    this.slider.addEventListener('input', () => this.jumpToPage(Number(this.slider.value)))

    this.q('.reader__thumbs-close').addEventListener('click', () => (this.thumbs.hidden = true))

    this.stage.addEventListener('wheel', (e) => this.onWheel(e), { passive: false })
    this.stage.addEventListener('dblclick', () => this.setZoom(this.zoom > 1 ? 1 : 2))
    this.wirePointer()
    window.addEventListener('keydown', (e) => this.onKey(e))
  }

  private onWheel(e: WheelEvent): void {
    if (this.el.hidden) return
    if (e.ctrlKey) {
      e.preventDefault()
      this.setZoom(this.zoom - Math.sign(e.deltaY) * 0.3)
    } else if (this.zoom > 1) {
      e.preventDefault()
      this.panY -= e.deltaY
      this.panX -= e.deltaX
      this.applyTransform()
    }
  }

  private wirePointer(): void {
    let downX = 0
    let downY = 0
    let startPanX = 0
    let startPanY = 0
    let dragging = false
    let moved = false
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchStart = 0
    let pinchZoom = 1

    const dist = () => {
      const [a, b] = [...pointers.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }

    this.stage.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.stage.setPointerCapture(e.pointerId)
      if (pointers.size === 2) {
        pinchStart = dist()
        pinchZoom = this.zoom
        return
      }
      downX = e.clientX
      downY = e.clientY
      startPanX = this.panX
      startPanY = this.panY
      dragging = true
      moved = false
    })

    this.stage.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.size === 2 && pinchStart > 0) {
        this.setZoom(pinchZoom * (dist() / pinchStart))
        return
      }
      if (!dragging) return
      const dx = e.clientX - downX
      const dy = e.clientY - downY
      if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) moved = true
      if (this.zoom > 1) {
        this.panX = startPanX + dx
        this.panY = startPanY + dy
        this.applyTransform()
      }
    })

    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchStart = 0
      if (!dragging) return
      dragging = false
      const dx = e.clientX - downX
      const dy = e.clientY - downY

      if (!moved) {
        this.onTap(e.clientX)
        return
      }
      if (this.zoom <= 1 && Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) this.tapRight()
        else this.tapLeft()
      }
    }
    this.stage.addEventListener('pointerup', end)
    this.stage.addEventListener('pointercancel', end)
  }

  private onTap(clientX: number): void {
    const rect = this.stage.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    if (x < 0.33) this.tapLeft()
    else if (x > 0.67) this.tapRight()
    else this.toggleUi()
    if (this.uiVisible) this.showUi()
  }

  private onKey(e: KeyboardEvent): void {
    if (this.el.hidden) return
    const s = this.host.getSettings()
    switch (e.key) {
      case 'ArrowRight':
        this.tapRight()
        break
      case 'ArrowLeft':
        this.tapLeft()
        break
      case 'ArrowDown':
      case 'PageDown':
        this.forward()
        break
      case 'ArrowUp':
      case 'PageUp':
        this.backward()
        break
      case ' ':
        e.preventDefault()
        if (e.shiftKey) this.backward()
        else this.forward()
        break
      case 'Home':
        this.jumpToPage(0)
        break
      case 'End':
        this.jumpToPage(this.book.pages.length - 1)
        break
      case 'Escape':
        if (!this.thumbs.hidden) this.thumbs.hidden = true
        else if (document.fullscreenElement) void document.exitFullscreen()
        else this.host.onExit()
        break
      case 'f':
        void this.toggleFullscreen()
        break
      case 'b':
        this.toggleBookmark()
        break
      case 't':
        this.toggleThumbs()
        break
      case 'd':
        this.mutate({ direction: s.direction === 'rtl' ? 'ltr' : 'rtl' })
        break
      case 'v':
        this.mutate({ view: s.view === 'spread' ? 'single' : 'spread' })
        break
      case '+':
      case '=':
        this.setZoom(this.zoom + 0.5)
        break
      case '-':
        this.setZoom(this.zoom - 0.5)
        break
      default:
        return
    }
    this.showUi()
  }
}

const TEMPLATE = /* html */ `
  <div class="reader__stage">
    <div class="reader__canvas">
      <img class="reader__img" data-slot="0" alt="" draggable="false" />
      <img class="reader__img" data-slot="1" alt="" draggable="false" />
    </div>
  </div>

  <header class="reader__bar reader__bar--top">
    <button class="btn" data-act="exit" title="Back to shelf (Esc)">✕</button>
    <span class="reader__title"></span>
    <span class="reader__counter"></span>
    <button class="btn reader__star" data-act="bookmark" title="Bookmark (B)" aria-pressed="false">★</button>
  </header>

  <footer class="reader__bar reader__bar--bottom">
    <div class="reader__controls">
      <button class="btn" data-act="dir" title="Reading direction (D)">RTL</button>
      <button class="btn" data-act="view" title="One / two pages (V)">One</button>
      <button class="btn" data-act="fit" title="Fit mode">Fit</button>
      <button class="btn" data-act="zoom-out" title="Zoom out (-)">−</button>
      <button class="btn" data-act="zoom-in" title="Zoom in (+)">＋</button>
      <button class="btn" data-act="thumbs" title="Pages (T)">▦</button>
      <button class="btn" data-act="fullscreen" title="Fullscreen (F)">⛶</button>
    </div>
    <input class="reader__slider" type="range" min="0" max="0" value="0" aria-label="Page" />
  </footer>

  <div class="reader__thumbs" hidden>
    <div class="reader__thumbs-head">
      <strong>Pages</strong>
      <button class="btn reader__thumbs-close">✕</button>
    </div>
    <div class="reader__thumbs-grid"></div>
  </div>
`
