<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Conventions in this repository

- **Write in Korean**: code comments, commit messages, and `SPEC.md`. Quotations
  in backticks and test names stay in English. See the Language section of
  `.claude/rules/jsdoc.md`. Rule documents themselves — this file included — are
  written in English.
- **Every exported symbol carries a JSDoc block**, following
  `.claude/rules/jsdoc.md`. Nothing counts them for you, so add the block in the
  same change as the `export`.
- **`SPEC.md` is the feature spec.** When behaviour changes, update its item and
  the test names it cites as evidence.
- **State the app knows lives in atoms; React keeps only DOM handles and
  widget-internal moments.** Before adding state, ask whether anything outside
  this one component needs to read it.
  - _Atom_ (effect-atom): anything the app knows — the reader Model, a shelf
    question or panel, what a screen opens with. Screen state stays scoped to
    the screen by leaving the atom unmounted elsewhere, so the registry drops it
    when the screen goes (`pendingDeleteAtom` in `src/app/shelfAtoms.ts`).
  - _React_ (`useState`, `useRef`): a ref to an element, or a moment inside one
    widget that nothing else reads — which menu is open, a drag in progress, a
    drop highlight. One atom per widget instance would only add a layer over
    `useState`.
  - No `useEffect` or `useLayoutEffect`. A listener, timer, or observer is an
    atom that registers in its read and cleans up with `get.addFinalizer`, or an
    Effect atom whose fiber is interrupted when it rebuilds. The reader's all
    live in `src/app/reader/session.ts`.
  - `Atom.family` hashes its argument structurally, so it cannot key on a DOM
    element (`Illegal invocation`). Key those by identity with a `WeakMap`.
