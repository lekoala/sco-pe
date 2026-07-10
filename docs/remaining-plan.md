# Remaining plan

The source, docs, bundles and regression coverage have been updated in this archive. The remaining work now depends on running real browsers or integrating the runtime into the admin application.

## 1. Run the full browser suite

Run locally:

```sh
npm install
npx playwright install chromium firefox
npm test
```

The local Playwright configuration runs Chromium. CI runs Chromium and Firefox.

Pay particular attention to the tests added for:

- moving/reconnecting an initialized `<sco-pe>`;
- canceled navigation while another request is in flight;
- `keep="same-html"` insertion and reordering;
- source/target lifecycle callbacks;
- `ok: false, rendered: true` validation responses;
- stale request cancellation and `aria-busy` cleanup.

## 2. Validate `keep` in Safari/WebKit

State-preserving keyed reorders use `Element.moveBefore()` when available. The fallback uses `insertBefore()`, which keeps the same JavaScript object but may run custom-element disconnect/connect callbacks.

Before relying on reordered kept widgets in Safari, choose one policy:

```txt
A. Document reordering as progressively enhanced; same-position widgets remain the primary use case.
B. Replace reordered widgets when state-preserving moves are unavailable.
C. Require kept custom elements to tolerate reconnects.
D. Adopt a dedicated morphing implementation with an explicit cross-browser contract.
```

The current recommendation is A: use `keep` for stable keyed islands, and do not design critical state around server-side reordering until WebKit behavior is validated.

## 3. Port one representative admin flow

Before moving from alpha to beta, port one end-to-end flow containing:

- sidebar navigation and browser back/forward;
- a GET filter form with `autosubmit`;
- a POST form returning `422` validation HTML;
- `Scope-Status` integration with the Actual CSS status bar;
- busy UI driven by `aria-busy` / `[busy]`;
- one dynamically loaded custom element through `Scope-Script`;
- one targeted update through `Scope-Target`;
- an expensive widget using `keep="same-html"`, if genuinely needed.

This pass should confirm that the conventions are sufficient without introducing action-level attributes beyond `data-confirm`.

## 4. Decide the beta support contract

Before `0.2.0-beta.0`, document the minimum browser versions and settle whether these remain public API:

- `onLoad` as the once-per-request compatibility callback;
- `afterLoad` as the per-updated-scope callback;
- `data-confirm` as the sole data-attribute exception;
- `syncDocumentAttributes`, which is disabled by default;
- `keep`, which remains an exact keyed-island feature rather than a general morph mode.

No additional feature work is recommended before the production integration pass. Cache/revalidation engines, overlays, optimistic rendering, inline callbacks and arbitrary fragment scripts should remain out of scope.

## 5. Release checklist

After the browser and admin integration passes:

```sh
npm run check
npm run lint
npm test
npm run build
npm pack --dry-run
```

Then update the changelog from alpha to beta and verify the generated tarball only contains the documented runtime files.
