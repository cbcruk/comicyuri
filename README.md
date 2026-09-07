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
  standalone cover so spreads line up like a printed book.
- **Fit modes** — fit to screen, fit width, fit height, or original size.
- **Zoom & pan** — pinch, `Ctrl`+wheel, the toolbar buttons, or double-tap;
  drag to pan when zoomed in.
- **Navigation** — tap zones (left / centre / right), swipe, keyboard, or the
  page slider. A thumbnail grid lets you jump anywhere.
- **Bookmarks**, **fullscreen**, an auto-hiding immersive UI, and a
  light / dark theme.

## Keyboard shortcuts

| Key                              | Action                                        |
| -------------------------------- | --------------------------------------------- |
| `←` / `→`                        | Turn page in the visual direction             |
| `↑` / `↓`, `PageUp` / `PageDown` | Previous / next                               |
| `Space` / `Shift`+`Space`        | Next / previous                               |
| `Home` / `End`                   | First / last page                             |
| `d`                              | Toggle reading direction                      |
| `v`                              | Toggle one / two pages                        |
| `t`                              | Thumbnail grid                                |
| `b`                              | Bookmark current page                         |
| `f`                              | Fullscreen                                    |
| `+` / `-`                        | Zoom in / out                                 |
| `Esc`                            | Close panel / exit fullscreen / back to shelf |

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

Pointer gestures (zoom, pan, pinch, tap zones, swipe), the page slider, the
thumbnail grid, bookmarks and fullscreen are still to come; today the reader
turns pages by button and keyboard.

## Development

This project uses [Vite+](https://viteplus.dev/). With the `vp` CLI:

```sh
vp install   # install dependencies
vp dev       # start the dev server
vp build     # production build
vp check     # format, lint and type-check
vp test      # story and scene tests
```

Foldkit is vendored as a git subtree under `repos/foldkit`, pinned to the
release tag matching the installed `foldkit` package, so its source, examples
and docs always describe the APIs this app compiles against. Re-pin it after an
upgrade:

```sh
git subtree pull --prefix=repos/foldkit https://github.com/foldkit/foldkit.git \
  "foldkit@$(node -p "require('./node_modules/foldkit/package.json').version")" --squash
```
