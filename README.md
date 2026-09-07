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

Everything that can fail — IndexedDB, `localStorage`, ZIP parsing, image
decoding — is expressed as an [Effect](https://effect.website/) (v4, pinned to
the current release candidate), so the failure modes are in the type rather
than in a `catch` block:

- `src/errors.ts` declares the tagged errors (`DbError`, `ArchiveError`,
  `EmptyBookError`, `NoComicFilesError`, `CoverError`) and the single
  `describe` function that turns one into shelf status text.
- `src/db.ts` holds each IndexedDB connection in a scope, so it is closed
  however the operation ends.
- Settings and reading progress are **decoded** through a schema
  (`src/types.ts`) instead of cast, so a corrupt or stale `localStorage` entry
  degrades to the defaults rather than reaching the UI.
- `src/app.ts` is the boundary: DOM handlers fork a fully-handled effect, and
  the `pagehide` progress write runs synchronously so it cannot be lost.

The DOM layers (`src/library.ts`, `src/viewer.ts`) stay plain imperative code
and run effects at their own edges.

## Development

This project uses [Vite+](https://viteplus.dev/). With the `vp` CLI:

```sh
vp install   # install dependencies
vp dev       # start the dev server
vp build     # production build
vp check     # format, lint and type-check
```
