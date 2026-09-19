# comicyuri

A browser-based comic / manga viewer, inspired by [ComicGlass](https://comicglass.net/).
Everything runs client-side — your files never leave the browser.

Try it at <https://cbcruk.github.io/comicyuri/>.

## Features

- **Open anything** — `.cbz` / `.zip` archives, loose image files, or a whole
  folder. Drag-and-drop onto the shelf works too.
- **Persistent shelf** — imported books are kept in IndexedDB, so your library
  survives a reload. Reading progress and bookmarks are remembered per book, and
  reopening a book can continue, ask, or start over.
- **Reading direction** — right-to-left (manga, default) or left-to-right, picked
  from **View › Read from**.
- **One or two pages** — single-page or two-page spread, with an optional
  standalone cover so spreads line up like a printed book. A wide page stands on
  its own, a pairing can be flipped by hand, and a double-page scan can be read
  one half at a time.
- **Fit modes** — fit to screen, fit width, fit height, or original size, with a
  switch that stops small pages from being stretched. In two-page mode, fit and
  width apply to the spread as a whole.
- **Rotation** — turn a sideways scan upright; the angle is remembered per book
  and fit modes follow it.
- **Zoom & pan** — pinch, `Ctrl`+wheel, the View menu, or double-tap; drag to
  pan when zoomed in.
- **Navigation** — tap zones (left / centre / right), swipe, keyboard, the wheel,
  the Go menu, or the page slider with its page ticks. Press the page counter to
  type a page number. A thumbnail grid lets you jump anywhere.
- **Next volume** — turning past the last page opens the next book on the shelf;
  you can make it stop or wrap around instead.
- **Scroll to read** — a page taller than the screen scrolls; with a mouse
  wheel, another notch at its end turns the page, and turning back lands at the
  bottom of the previous one.
- **Bookmarks** — mark any page, jump between marks with `[` / `]`, or narrow
  the thumbnail grid to the marked pages.
- **Slideshow** — turn pages on a timer, two to thirty seconds a page.
- **Settings per book** — optionally keep direction, layout and fit for each
  book instead of one global setting.
- **Fullscreen**, a menubar you can hide to leave only the page, and a light /
  dark theme.

## Keyboard shortcuts

| Key                              | Action                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `←` / `→`                        | Turn page in the visual direction                                  |
| `↑` / `↓`, `PageUp` / `PageDown` | Previous / next                                                    |
| `Space`                          | Next                                                               |
| `Shift` + `Space`                | Previous                                                           |
| `Shift` + turn key               | Skip ten pages                                                     |
| `Home` / `End`                   | First / last page                                                  |
| `d`                              | Toggle reading direction                                           |
| `v`                              | Toggle one / two pages                                             |
| `s`                              | Flip how the current spread is paired                              |
| `r`                              | Turn the page a quarter clockwise                                  |
| `+` / `-`                        | Zoom in / out                                                      |
| `t`                              | Thumbnail grid                                                     |
| `b`                              | Bookmark current page                                              |
| `[` / `]`                        | Previous / next bookmark                                           |
| `p`                              | Start / stop the slideshow                                         |
| `,`                              | Reading settings                                                   |
| `f`                              | Fullscreen                                                         |
| `h`                              | Hide / show the menubar                                            |
| `Esc`                            | Close settings, then the grid, the slideshow, fullscreen, the book |

## How CBZ files are read

CBZ archives are ZIP files. `src/io/zip.ts` parses the central directory and
extracts pages lazily, reading only the byte ranges it needs through `Blob.slice`
rather than loading the whole archive into memory. Deflated entries are inflated
with the platform's native `DecompressionStream`, so there is no third-party ZIP
dependency.

## Development

This project uses [Vite+](https://viteplus.dev/). With the `vp` CLI:

```sh
vp install   # install dependencies
vp dev       # start the dev server
vp build     # production build
vp check          # format, lint and type-check
vp test           # unit tests, under happy-dom
vp run test:screen # component tests, in a real Chromium
vp run e2e        # browser tests, against a production build
```

There are three rings, and each one covers what the ring inside it cannot.

`vp test` runs under happy-dom: the reader's `update`, the pure calculations
around it, and the IO layer against fakes. Nothing is rendered, so nothing here
depends on a layout or a real pointer.

`vp run test:screen` mounts components in a real Chromium through Vitest's
browser mode. That is where the things a DOM has to answer live — what the
accessibility tree says, how far a page can scroll, whether the stage takes the
height a hidden menubar gave up. It stops short of the whole app: no router, no
IndexedDB, and each screen stands on its own.

`vp run e2e` is where that last gap is covered. Playwright builds the app, serves
`dist` with `vp preview`, and drives the real thing in Chromium: layout and
computed colour, pointer input including two-finger pinches over CDP, the
Fullscreen API, the folder picker, and whether anything survives a reload.
Books are built on the fly — `e2e/fixture/archive.ts` writes the PNGs and the
ZIP itself, so no binary fixtures live in the repository. Add `--ui` (or
`vp run e2e:ui`) to watch them run.

The browsers Playwright drives are not in `node_modules`. A fresh checkout
installs them once:

```sh
vp exec playwright install chromium
```

`SPEC.md` is the contract. Every behaviour this viewer has is one numbered item
there, with the tests that hold it down named underneath. When behaviour
changes, that item and the test names it cites change in the same commit — it is
how a bug report can say "R-246 is wrong" and land on the test that was supposed
to prevent it.
