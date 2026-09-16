# comicyuri

A browser-based comic / manga viewer, inspired by [ComicGlass](https://comicglass.net/).
Everything runs client-side — your files never leave the browser.

## Features

- **Open anything** — `.cbz` / `.zip` archives, loose image files, or a whole
  folder. Drag-and-drop onto the shelf works too.
- **Persistent shelf** — imported books are kept in IndexedDB, so your library
  survives a reload. Reading progress and bookmarks are remembered per book.
- **Reading direction** — right-to-left (manga, default) or left-to-right.
- **One or two pages** — single-page or two-page spread, with an optional
  standalone cover so spreads line up like a printed book. A double-page scan can
  be read one half at a time.
- **Fit modes** — fit to screen, fit width, fit height, or original size, with a
  switch that stops small pages from being stretched.
- **Rotation** — turn a sideways scan upright; the angle is remembered per book
  and fit modes follow it.
- **Zoom & pan** — pinch, `Ctrl`+wheel, the View menu, or double-tap; drag to
  pan when zoomed in.
- **Navigation** — tap zones (left / centre / right), swipe, keyboard, the wheel,
  or the page slider. A thumbnail grid lets you jump anywhere, and the header
  names the files currently on screen.
- **Scroll to read** — a page taller than the screen scrolls; with a mouse
  wheel, another notch at its end turns the page, and turning back lands at the
  bottom of the previous one.
- **Bookmarks** — mark any page, jump between marks with `[` / `]`, or narrow
  the thumbnail grid to the marked pages.
- **Slideshow** — turn pages on a timer, two to thirty seconds a page.
- **Fullscreen**, a menubar you can hide to leave only the page, and a light /
  dark theme.

## Keyboard shortcuts

| Key                              | Action                                         |
| -------------------------------- | ---------------------------------------------- |
| `←` / `→`                        | Turn page in the visual direction              |
| `↑` / `↓`, `PageUp` / `PageDown` | Previous / next                                |
| `Space`                          | Next                                           |
| `Shift` + `Space`                | Previous                                       |
| `Shift` + turn key               | Skip ten pages                                 |
| `Home` / `End`                   | First / last page                              |
| `d`                              | Toggle reading direction                       |
| `v`                              | Toggle one / two pages                         |
| `t`                              | Thumbnail grid                                 |
| `b`                              | Bookmark current page                          |
| `p`                              | Start / stop the slideshow                     |
| `r`                              | Turn the page a quarter clockwise              |
| `[` / `]`                        | Previous / next bookmark                       |
| `f`                              | Fullscreen                                     |
| `+` / `-`                        | Zoom in / out                                  |
| `Esc`                            | Close the grid, then fullscreen, then the book |

## How CBZ files are read

CBZ archives are ZIP files. `src/io/zip.ts` parses the central directory and
extracts pages lazily, reading only the byte ranges it needs through `Blob.slice`
rather than loading the whole archive into memory; deflated entries are inflated with the platform's native
`DecompressionStream`, so there is no third-party ZIP dependency.

## Architecture

The UI is [React](https://react.dev/) with
[Effect Atom](https://github.com/tim-smart/effect-atom) over
[Effect](https://effect.website/) (v4, pinned to the current release candidate),
and [TanStack Router](https://tanstack.com/router) for the two routes. The
reader keeps The Elm Architecture it was written with: one Model, fact-named
Messages, and a single exhaustive `update`. What changed is who runs it — a
`useReducer`-shaped atom rather than a framework runtime.

```
index.html          the document; it sets the stored theme before the first paint
src/app/main.tsx    mounts React and the atom registry
src/app/router.tsx  the routes: / and /book/:id, and the not-found page
src/app/shelf.tsx   the shelf screen, with shelfAtoms.ts behind it
src/app/reader/     the reader screen: layout, events, persistence, stage, spread
src/app/chrome/     the menubar, the counter row and the footer
src/app/settings/   the reading-settings dialog
src/app/thumbs/     the thumbnail grid, over TanStack Virtual
src/app/state/      settings, per-book settings, progress, neighbouring books
src/reader/         the reader Model, Messages and update — no React, no atoms
src/atoms/          the page-loading atoms: a book, a page URL, a spread
src/domain/         BookSummary and the pure operations on it
src/io/             IndexedDB, localStorage, ZIP reading, image headers, covers
```

`src/reader/` is the part that does not know it is in a browser. Turning a page,
zooming, pairing spreads, reading a gesture, deciding what a key means — all of
it is pure functions over a Model, so `src/reader/story.test.ts` can drive the
whole reader by sending Messages and reading the Model back out.

Everything that can fail — IndexedDB, `localStorage`, ZIP parsing, image
decoding — lives underneath as plain Effect, so the failure modes are in the
type rather than in a `catch` block:

- `src/errors.ts` declares the tagged errors (`DbError`, `ArchiveError`,
  `EmptyBookError`, `NoComicFilesError`, `CoverError`) and the single
  `describe` function that turns one into shelf status text.
- `src/io/db.ts` holds each IndexedDB connection in a scope, so it is closed
  however the operation ends.
- Settings and reading progress are **decoded** through a schema
  (`src/types.ts`) instead of cast, so a corrupt or stale `localStorage` entry
  degrades to the defaults rather than reaching the UI.
- `src/reader/command.ts` is the seam: what `update` cannot do itself becomes a
  named Command, and its success or failure arrives back as a Message.

Object URLs have no owner to forget them. Each page is one atom, keyed by book
and page number, and the URL is made and revoked inside that atom's scope. When
nothing wants that page any more — it fell too far behind, or the book was
closed — the registry drops the atom and the URL goes with it. Holding a page is
therefore the same thing as subscribing to it: the reader mounts the pages it
draws, the ones it preloads, and the ones it is not ready to let go of yet.

Pointer gestures live in `src/reader/gesture.ts` as pure functions over
coordinates measured from the centre of the viewport — the same origin the pan
offset uses — so `update` never has to know the size of anything. One press is
deliberately undecided until it lifts: a tap on the outer thirds turns a page,
a tap in the middle shows or hides the chrome, a sideways drag is a swipe, two
taps zoom, and once zoomed the same drag pans instead.

The thumbnail grid is [TanStack Virtual](https://tanstack.com/virtual) over rows
of pages, and `src/reader/thumbs.ts` turns a measured width into the three
numbers a row needs — how many cells fit, how wide each is, how tall the row is
— so a five-hundred-page book draws a grid without unpacking five hundred
images. Each cell subscribes to the same page atom the reader uses, so a page
turn cannot blank a grid that is showing it.

## Deploying

`vp build` writes a static bundle to `dist/`. There is no server: books live in
the reader's own browser, in IndexedDB, and never leave it. Any static host will
do.

The one thing a host must be told is what to serve for `/book/<id>`. No file
sits at that path — routing happens in the browser — so the answer is always
`index.html`. Two config files in this repository say so:

| File                | Read by                   |
| ------------------- | ------------------------- |
| `public/_redirects` | Cloudflare Pages, Netlify |
| `vercel.json`       | Vercel                    |

Asset paths in the built `index.html` are absolute (`/assets/…`), so the
document works when it is served at a nested path. That is what makes the
fallback enough on its own.

### GitHub Pages

The live copy is at <https://cbcruk.github.io/comicyuri/>. Every push to `main`
deploys it through `.github/workflows/pages.yml`, after `vp check` and `vp test`
pass.

Pages needs two things the other hosts do not, and the `github-pages` build mode
supplies both:

- **A base path.** The site lives under `/comicyuri/`, not at the root. The mode
  sets Vite's `base`, so assets point there, and the router strips it before
  matching a route and adds it back when building a link.
- **A `404.html`.** Pages has no rewrite rule; it serves `404.html` for any path
  with no file. The mode writes a copy of `index.html` under that name. The
  response carries status 404, but the browser loads the app all the same.

```sh
vp run build:pages   # writes dist-pages/
```

`vp run e2e` builds this bundle too and serves it from a small server that
behaves like Pages (`e2e/fixture/pages-host.ts`), so a missing `404.html` or a
route that ignores the base path fails a test rather than a deploy.

### Other hosts

Deploying elsewhere is one command against a host you are signed in to. For
Cloudflare Pages:

```sh
vp build
npx wrangler pages deploy dist
```

Vercel and Netlify need only the repository connected; the config files above
are already in it.

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
