# Remaining plan

Current status toward a v0.2 release.

## 1. Run the full browser suite

```sh
bun install
bunx playwright install chromium firefox webkit
bun test
```

CI runs the suite on Chromium, Firefox, and WebKit (see
`.github/workflows/ci.yml`). The `verify` job runs `bun run check`, `bun run
lint`, `bun run build`, and `bun pm pack --dry-run`.

## 2. WebKit `keep` validation

The WebKit project is now part of CI. `Element.moveBefore()` is unavailable in
WebKit, so the `insertBefore()` fallback in `src/keep.js` runs
disconnect/connect callbacks when keyed kept widgets are reordered.

- Widget preservation without reordering is covered on WebKit.
- Reordering is covered for correctness of order on every engine; the
  "no reconnect" assertion only runs where `Element.moveBefore` exists.

Follow-up: decide whether reordering kept widgets on WebKit is a supported
guarantee or an explicit limitation to document in the README.

## 3. Implement the multi-target specification

`docs/multi-target.md` defines the v0.2 model (`<scope-partial target select>`)
but it is not implemented yet. Work items:

1. Parse `<scope-partial>` in `src/dom.js` and strip the wrappers.
2. Generalize the `Scope-Target` branch in `src/Scope.js` into a loop over
   `{ target, select, html }`, claiming every target before the first swap.
3. Add per-target failure isolation and the aggregate source `scope:load`
   event.
4. Regression tests mirroring the cross-target stale and busy-state tests.

## 4. Port one representative admin flow

Port one end-to-end flow containing:

- sidebar navigation and browser back/forward;
- a GET filter form with `autosubmit` and `scope-swap`;
- a POST form returning `422` validation HTML;
- `Scope-Status` integration;
- busy UI driven by `aria-busy` / `[busy]`;
- one dynamically loaded custom element through `Scope-Script`;
- one targeted update through `Scope-Target`.

## 5. Release checklist

```sh
bun run check
bun run lint
bun run verify
bun test
bun run build
bun pm pack --dry-run
```
