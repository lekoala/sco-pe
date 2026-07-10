# Remaining plan

## 1. Run the full browser suite

```sh
npm install
npx playwright install chromium firefox
npm test
```

## 2. Safari/WebKit `keep` validation

`Element.moveBefore()` is unavailable in WebKit; the `insertBefore()` fallback
may run custom-element disconnect/connect callbacks. Test reordered kept widgets
before relying on them in Safari.

## 3. Port one representative admin flow

Port one end-to-end flow containing:

- sidebar navigation and browser back/forward;
- a GET filter form with `autosubmit` and `scope-swap`;
- a POST form returning `422` validation HTML;
- `Scope-Status` integration;
- busy UI driven by `aria-busy` / `[busy]`;
- one dynamically loaded custom element through `Scope-Script`;
- one targeted update through `Scope-Target`.

## 4. Release checklist

```sh
npm run check
npm run lint
npm test
npm run build
npm pack --dry-run
```
