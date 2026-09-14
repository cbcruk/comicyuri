# JSDoc Rules

Rules for writing JSDoc comments on exported symbols in a TypeScript package.
Apply every rule to every symbol you write or edit.

## Summary line

The first paragraph is the only part shown in editor tooltips, autocomplete
lists, and search indexes. Write it as one concise sentence describing what the
symbol does, so a reader scanning an autocomplete list can pick the right symbol
without opening anything else.

Put implementation details, caveats, and rationale in later paragraphs.

```ts
/** Replaces all spaces in a string with underscores. */
```

## Types

Carry type information in the TypeScript signature. Describe meaning in the
comment: what the value represents, its valid range, and any sentinel value.

```ts
/**
 * Finds a substring and returns the index of its first occurrence.
 *
 * @param value The string to search.
 * @param needle The substring to search for.
 * @returns The index of the first occurrence, or -1 when the needle is absent.
 */
declare function find(value: string, needle: string): number
```

Reserve `@param` and `@returns` for facts the signature cannot state — the `-1`
above is the case that earns the tag.

## Examples

Add `@example` for symbols with several parameters or non-obvious behaviour. The
text on the `@example` line is the title; the text below the code block is its
description. Include the `import` statement so the block runs when pasted.

````ts
/**
 * @example Basic usage
 * ```ts
 * import { move } from "@std/fs/move";
 *
 * await move("./foo", "./bar");
 * ```
 *
 * This moves `./foo` to `./bar` without overwriting.
 */
````

Write one example per distinct use case.

## Coverage

Document every exported symbol: functions, classes, interfaces, type aliases.
For classes and interfaces, document the symbol itself plus each constructor,
method, and property.

When a package exposes several modules, put a `@module` comment at the top of
each module file with a summary paragraph and a usage example. Its first
paragraph becomes the module's description on the package index.

```ts
/**
 * Contains the middleware application, the core concept of oak.
 *
 * @module
 */
```

## Markdown

Write comment bodies in Markdown: headings, bullet lists, bold, block quotes,
links, and inline code.

## Internal links

Link to other symbols in the package with `{@linkcode}` (renders as code),
`{@link}`, or `{@linkplain}`. These become clickable in editor tooltips and in
generated docs. References to built-in objects such as `ArrayBuffer` resolve to
MDN.

```ts
/** Options for styling text with the {@linkcode print} function. */
```

## Freshness

Edit the JSDoc in the same change as the code it describes. Where the toolchain
supports it, type-check the example blocks (`deno test --doc`) and lint public
symbols for missing comments and return types (`deno doc --lint`) before
publishing.

In this repo that check is `vp check`. The oxlint jsdoc plugin is enabled in
`vite.config.ts` with two tag rules at error: `jsdoc/check-tag-names` catches a
mistyped `@retruns`, and `jsdoc/empty-tags` catches an empty `@example`. The
`require-param` and `require-returns` rules stay off, as they contradict the
Types rule above.

Know what is missing, too. **Nothing counts exported symbols against their JSDoc
blocks, and nothing type-checks an `@example`.** Coverage here is discipline, not
a gate: when you add an `export`, add the block above it in the same change.

## Renderer-dependent syntax

These render only on some documentation sites — confirm the target renderer
supports them before use:

- `> [!IMPORTANT]` alert blocks (JSR).
- `@example` title/description splitting (JSR renders it; plain JSDoc does not).
- `@typeParam` is a TSDoc tag; `@template` is the JSDoc equivalent. Use whichever
  the repo already uses, consistently.

## Applying these rules in comicyuri

- This is an application, not a published package. There is no module index, so
  no `@module` tags: a file-level note is a `/** */` block without one, the way
  `types.ts`, `storage.ts`, and `zip.ts` already write it. The entry point is
  `src/entry.ts`, and an `@example` has no package specifier to import from —
  use a relative path.
- This repo has no JSR renderer, so avoid the renderer-dependent syntax above.
  Keep `@example` titles short — they read as a plain line in editor tooltips.
- Nothing type-checks an `@example`, so they rot silently. Use them sparingly,
  and only with a block that runs when pasted — no names left undefined.
- The summary line may run to a second short sentence, but the first must say
  what the symbol is or does. Rationale, `NOTE:`, and history go below the blank
  line: `ApplyTheme` opens with what it sets, then why the theme lives on the
  document root.
- `@param` / `@returns` earn their keep when they state a unit, an encoding, or
  a sentinel the signature cannot: `maxSize` in `makeCover` is the longest edge,
  `turnFromEdge` returns `1` or `-1`, `perRowFor` takes pixels. A tag that
  restates the parameter name does not. When an `Option` return only needs its
  `None` condition, say it in the body instead.
- `@template` is the tag for type parameters. The generic view helpers
  (`controlView`, `settingsView`) take `Msg`, the caller's Message type, and
  leave it untagged — a name that says everything needs no tag. Tag a type
  parameter only when its name does not.
- Document a property when its name and type leave something unsaid: a unit, a
  sentinel, or why it exists. Self-evident fields such as `bookId`, `x`, and
  `y` stay bare, even beside documented siblings in the same struct.
- Do not copy values into prose. A comment that lists what `DEFAULTS` holds
  falls behind the moment a field is added.
- A comment that describes a declaration is JSDoc, not `//`, even on a private
  helper. A `//` block inside an expression that explains several things at once
  is a sign to extract a named helper and move the explanation to its JSDoc.
- Verify with `vp check` and `vp test` in the same change.

## Language

The comments themselves are written in Korean, as are commit messages and
`SPEC.md`. This document and `CLAUDE.md` are rules rather than prose about the
code, and stay in English.

Left in English inside comments:

- **Anything quoted in backticks** — `flex-row-reverse`, `aria-valuenow`,
  `Effect.callback`, Message tag names. These are quotations, not prose.
- **Test names**, which `SPEC.md` cites as evidence for its items.
- **Section markers** such as `// FLAGS` and `// INIT`, which name Foldkit's own
  divisions.

Follow the register `SPEC.md` established: plain declarative endings (`~한다`),
with technical nouns left in English ("툴바", "스프레드", "`data-theme`").
