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
- **Zoom & pan** — pinch, `Ctrl`+wheel, the toolbar buttons, or double-tap;
  drag to pan when zoomed in.
- **Navigation** — tap zones (left / centre / right), swipe, keyboard, the wheel,
  or the page slider. A thumbnail grid lets you jump anywhere, and the toolbar
  names the files currently on screen.
- **Scroll to read** — a page taller than the screen scrolls; with a mouse
  wheel, another notch at its end turns the page, and turning back lands at the
  bottom of the previous one.
- **Bookmarks** — mark any page, jump between marks with `[` / `]`, or narrow
  the thumbnail grid to the marked pages.
- **Slideshow** — turn pages on a timer, two to thirty seconds a page.
- **Fullscreen**, an auto-hiding immersive UI, and a light / dark theme.

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

CBZ archives are ZIP files. `src/zip.ts` parses the central directory and
extracts pages lazily; deflated entries are inflated with the platform's native
`DecompressionStream`, so there is no third-party ZIP dependency.

## Architecture

The UI is [Foldkit](https://foldkit.dev/) — The Elm Architecture on top of
[Effect](https://effect.website/) (v4, pinned to the current release
candidate). One Schema-defined Model is the source of truth, events become
fact-named Messages, and every side effect is an explicit Command the runtime
runs.

```
src/entry.ts     Runtime.makeApplication + Runtime.run
src/main.ts      Flags (settings, read before the first paint) and init
src/model.ts     the Model schema
src/message.ts   the Message union
src/command.ts   Commands: the Effect core below, named and typed
src/update.ts    the one exhaustive transition function
src/route.ts     bidirectional routes: / and /book/:id
src/view/        the shelf, and the root view that dispatches on the route
src/page/reader/ the reader Submodel: its own Model, Messages, Commands,
                 ManagedResource and keyboard Subscription
src/domain/      BookSummary and the pure operations on it
```

Everything that can fail — IndexedDB, `localStorage`, ZIP parsing, image
decoding — lives underneath as plain Effect, so the failure modes are in the
type rather than in a `catch` block:

- `src/errors.ts` declares the tagged errors (`DbError`, `ArchiveError`,
  `EmptyBookError`, `NoComicFilesError`, `CoverError`) and the single
  `describe` function that turns one into shelf status text.
- `src/db.ts` holds each IndexedDB connection in a scope, so it is closed
  however the operation ends.
- Settings and reading progress are **decoded** through a schema
  (`src/types.ts`) instead of cast, so a corrupt or stale `localStorage` entry
  degrades to the defaults rather than reaching the UI.
- `src/command.ts` is the seam: each of those Effects becomes a named Command,
  and its success and failure arrive back in `update` as Messages.

The reader lives in `src/page/reader/` as a Submodel that reports up through
three OutMessages: it asks to leave, hands back settings it changed, and
reports the reading position for the application to persist. Its opened book —
the parsed ZIP archive and the object URLs its pages hand out — is a
ManagedResource keyed on Model state, so opening happens when the reader
appears and every page URL is released when it goes away.

Pointer gestures live in `src/page/reader/gesture.ts` as pure functions over
coordinates measured from the centre of the viewport — the same origin the pan
offset uses — so `update` never has to know the size of anything. One press is
deliberately undecided until it lifts: a tap on the outer thirds turns a page,
a tap in the middle shows or hides the chrome, a sideways drag is a swipe, two
taps zoom, and once zoomed the same drag pans instead.

The thumbnail grid is `@foldkit/ui`'s `VirtualList` over rows of pages, and
`src/page/reader/thumbs.ts` reads the window back out of the list's own scroll
state to decide which pages to extract — so a five-hundred-page book draws a
grid without unpacking five hundred images. Pages the grid is showing are
added to what a page turn keeps loaded, or turning would blank it.

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

Deploying is then one command against a host you are signed in to. For
Cloudflare Pages:

```sh
vp build
npx wrangler pages deploy dist
```

GitHub Pages is not set up. It would need two more things: a `base` path in the
Vite config, because the site lives under `/<repo>/` rather than at the root,
and a copy of `index.html` at `404.html`, because Pages has no rewrite rule and
serves that file for unknown paths instead.

## Development

This project uses [Vite+](https://viteplus.dev/). With the `vp` CLI:

```sh
vp install   # install dependencies
vp dev       # start the dev server
vp build     # production build
vp check     # format, lint and type-check
vp test      # story and scene tests
vp run e2e   # browser tests, against a production build
```

`vp test` runs the update and view tests under happy-dom, which is as far as
that environment goes: `Runtime.run` renders nothing there, so init, the
subscriptions, the ManagedResource and routing are never exercised together.

`vp run e2e` is where that gap is covered. Playwright builds the app, serves
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

Foldkit's own source, examples and docs are the reference this app was written
against, and they are worth having on disk while working on it. They are not
carried in this repository — that is 12 MB of files belonging to another
project — so `repos/` is ignored, and a checkout adds them if it wants them,
pinned to the release this app installs:

```sh
git clone --depth 1 \
  --branch "foldkit@$(node -p "require('./node_modules/foldkit/package.json').version")" \
  https://github.com/foldkit/foldkit.git repos/foldkit
rm -rf repos/foldkit/.git repos/foldkit/repos
```

The last path is Foldkit's own vendored copy of Effect: 36 MB of source
already sitting in `node_modules/effect` at the same pinned version.
