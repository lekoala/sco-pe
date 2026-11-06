# Changelog

## Unreleased

- An initialized scope whose `src` changes while disconnected loads the latest
  value on reconnect, without sending requests while detached.
- Adds `loading="lazy"` for empty scopes with a `src`, using a 200px
  IntersectionObserver margin while preserving prerendered content.
- Adds `poll="30s"` (also `ms` and `m`) for periodic revalidation without
  history, focus or scroll changes. Polling waits for active requests, pauses
  in hidden documents, and stops on disconnect.
- Back/forward to a history entry sco-pe did not create (native anchor
  navigation, application `pushState`) no longer reloads the page while the
  document is still untouched, so History-API state survives scoped
  navigation. Once sco-pe has swapped content, such an entry resynchronizes
  the page so URL and content cannot diverge.
- `reload()`, `revalidate()` and initial or lazy `src` loads honor the scope's
  `scroll` attribute and never scroll the document to the top on their own;
  the implicit `top` default now applies to user-initiated navigation only.
- `Scope-Location` updates the browser history entry to the loaded URL, so a
  POST that reaches its resource through it behaves as a scoped
  POST-redirect-GET. A raw `301`/`302`/`303` followed by `fetch` still does
  not (documented in the server contract).
- `scroll="hash"` keeps the fragment of a cross-page link in the URL and
  reveals the target after the swap.
- `Scope-Redirect` only follows `http:` / `https:` URLs; any other scheme,
  including `javascript:`, is refused with `scope:error`.
- Relative links and forms in a scope resolve against the URL that scope came
  from, including scopes without history (`history="false"` or no `id`), and
  against the document base (including an author `<base href>`) before a scope
  has loaded.
- A `src` change during the initial load is now honored once the first load
  settles.
- A scoped fragment that contains nested `<sco-pe>` children is accepted; only
  a fragment whose root is another scope's wrapper fails closed.
- `Scope-Status` / `Scope-Alert` / `Scope-Title` no longer turn literal `+`
  into spaces (values are plain text or `encodeURIComponent`-encoded).

## 0.3.0

- Sends `Scope-Source` (id of the requesting scope) and `Scope-Target` (id of
  the scope the response lands in) with every request, so endpoints can render
  only what the destination needs. Responses that depend on them must list
  them in `Vary`.
- `reload()` / `revalidate()` on the source of a targeted navigation no longer
  reuses the history URL, which describes the target's content.
- Fixes a routed response (`target` attribute or `Scope-Target`) that arrived
  late overwriting a navigation the user started on the target scope after the
  routed request began. The latest user intent now owns the target.
- Fixes back/forward for a scope with `target`: history entries record the
  target, so restoration renders into the target scope instead of the source.

## 0.2.1

- Adds the `Scope-Event` response header: a comma-separated list of domain
  signal names dispatched as one bubbling `scope:event` per name
  (`detail.name`), including on `204`/`205`/`304` responses without a swap.
  Rendered responses also expose the list as `detail.events`.
- Adds the `static/server-dialog.html` demo: Actual CSS (CDN) owns the native
  `<dialog>`, sco-pe owns the server-driven content, and a `server-dialog`
  enhancement opens regular links in a persistent modal host.

## 0.2.0

- Adds `scope-swap` attribute to replace a single child element instead of the
  entire scope content, preventing focus loss on form inputs during autosubmit.
- Rewritten scoped navigation runtime with native links and forms.
- Adds accessibility, request cancellation, transitions, keep mode, asset loading
  and `scope-swap` for surgical child replacement.
- Introduces `Scope-*` response headers and removes the public `data-scope-*` API.
- Adds `data-confirm` for link and form confirmation, including submitter overrides.
- Refuses non-HTML responses before loading `Scope-Script` / `Scope-Style` assets.
- Leaves modified clicks, middle clicks, download links and `method="dialog"` forms
  to the browser.
- Prevents stale aborted requests from clearing `aria-busy` for a newer request.
- Runs the target scope lifecycle when `Scope-Target` updates another scope.
- Prevents server-returned `<sco-pe>` wrappers from removing client-owned behavior
  attributes by omission.
- Prevents an initialized `<sco-pe>` from reloading when it is moved or reconnected.
- Keeps an in-flight request alive when a later navigation is canceled in
  `scope:before-load`.
- Prevents stale responses delayed by asset loading from swapping over newer content.
- Separates HTTP success (`ok`) from successful DOM rendering (`rendered`) in
  lifecycle details.
- Treats `304 Not Modified` as a successful unchanged response and preserves
  response status on errors.
- Falls back to full browser navigation when a `popstate` restoration cannot render
  scoped content.
- Fixes a recursive `keep="same-html"` edge case when the response inserts a new
  node.
- Preserves client-owned scope classes while replacing server-provided wrapper
  decoration.
- Fails clearly when a registered component module does not define its expected
  custom element.
- Removes the unused fragment asset-template convention; dynamic assets now use
  headers or the component registry.
- Prevents a superseded routed `Scope-Target` response or `scope-swap` from
  writing the DOM after a newer target navigation.
- Respects `event.defaultPrevented` and native form validity (`novalidate`) for
  autosubmit, and preserves application keys in `history.state`.
- Adds a configurable request `timeout` shared with asset loading, and a
  `sync="replace|queue|drop"` policy for overlapping requests.
- Uses the configured `timeout` and `transitionTimeout` when their attributes
  are absent instead of falling back to zero.
- Drops queued (`sync="queue"`) requests when a scope is explicitly aborted or
  disconnected, so a stale request cannot fire later.
- Adds WebKit to CI and real back/forward history regression tests.
- Adds CI (Bun, split verify/browser jobs on the Playwright container), refreshed
  bundles, and regression tests for the new behaviors.
- Defaults `sync` to `auto` (safe methods replace, mutations drop with
  `scope:sync-dropped`); explicit `replace|queue|drop` unchanged, and `queue`
  stays latest-pending rather than a FIFO.
- Makes `scope-swap` fail closed (missing target or ambiguous payload errors
  instead of full-swapping) and preserves surviving focus outside the swapped
  child.
- Normalizes `sync|focus|scroll|announce|keep` values with documented
  fallbacks, removes the undocumented `focus="preserve"` alias, and documents
  `205` as a no-swap `reset: true` lifecycle signal.
- Documents the WebKit `keep` reordering limitation, defers multi-target
  beyond v0.2, and adds `docs/server-contract.md` (dual representation,
  `Vary: Scope-Request`, PSR-7 example, `/admin-flow` fixture) plus
  `docs/security.md`.
- Retries the initial `src` load when the scope was detached mid-flight
  instead of leaving an empty initialized scope, without leaking `scope:error`.
- Resolves fragment insertion-time resource URLs (`img`, `source`, `video`,
  `audio`, `track`, `iframe`) against the response URL; unchanged resolutions
  keep their original text.
- Preserves an author-provided inline `min-height` across swaps instead of
  clearing it after the layout hold.

See [the upgrade notes](docs/upgrade-notes.md) for breaking changes and migration
guidance.

## 0.1.0

Never released, no changelog entries.
