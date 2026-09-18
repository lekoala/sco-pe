# Changelog

## 0.2.0-dev

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

See [the upgrade notes](docs/upgrade-notes.md) for breaking changes and migration
guidance.
