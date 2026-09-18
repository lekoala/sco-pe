# sco-pe

Scoped navigation for server-rendered apps.

`sco-pe` is an autonomous custom element. It progressively enhances regular links and forms inside a scoped region: requests are fetched, matching server-rendered HTML is swapped back into the scope, and regular navigation still works without JavaScript.

The public surface is intentionally small: behavior is configured on `<sco-pe>`, response behavior comes from `Scope-*` headers, and richer client-side behavior comes from external modules or custom elements.

## Goals

- valid, quiet HTML;
- native links and forms first;
- one custom element boundary: `<sco-pe>`;
- no public `data-scope-*` attribute API;
- modern `fetch()`;
- per-scope request cancellation;
- accessible busy, focus, status, and alert behavior;
- external asset loading through `Scope-*` headers;
- no inline script execution from fetched HTML by default;
- Playwright coverage for real navigation and form flows.

## Basic usage

```html
<script type="module" src="/assets/sco-pe.js"></script>

<div id="scope-status" role="status" aria-live="polite" aria-atomic="true"></div>
<div id="scope-alert" role="alert" aria-atomic="true"></div>

<sco-pe id="main" src="/admin/users" history="true">
  <!-- Optional server-rendered fallback content. -->
</sco-pe>
```

Inside the scope, regular links and forms are enough:

```html
<a href="/admin/users?page=2">Next</a>

<form action="/admin/users" method="get">
  <input name="q">
  <button>Search</button>
</form>

<form action="/admin/users" method="post">
  <input name="email" type="email" required>
  <button name="save" value="1">Save</button>
</form>
```

For non-GET actions, prefer normal forms over JavaScript-only button actions:

```html
<form action="/admin/users/12/archive" method="post">
  <button>Archive</button>
</form>
```

## Attributes on `<sco-pe>`

Attributes on `<sco-pe>` are the public custom element API:

```html
<sco-pe
  id="main"
  src="/admin/users"
  history="true"
  select="sco-pe#main"
  target="_self"
  focus="auto"
  scroll="top"
  announce="auto"
  autosubmit="300"
  sync="queue"
  timeout="30000"
  keep="same-html"
  keep-selector="admin-rich-select, admin-map"
  transition="fade"
  transition-timeout="250"
></sco-pe>
```

Supported behavior attributes:

```txt
src                 initial URL to load
history             true/false, update browser history for safe requests
select              selector to extract from full-document responses
target              another <sco-pe id> or _self
focus               auto|heading|first-error|keep|none
scroll              top|keep|none|hash
announce            auto|status|alert|none
autosubmit          debounce in ms for GET forms inside the scope
scope-swap          selector for a single child to replace instead of the whole scope
keep                none|same-html
keep-selector       optional selector for kept same-html elements
transition          none or a CSS mode name, e.g. fade
transition-timeout  fallback duration in ms
sync                auto|replace|queue|drop for overlapping requests (default auto)
timeout             request timeout in ms, default 60000
disabled            leave links and forms to the browser (unless exactly "false")
```

`select` always extracts the selected element's *content*, rather than injecting the selected wrapper element.

## Confirmation

`data-confirm` is the one deliberate data-attribute exception. The message belongs to an individual native action, not to the surrounding scope. Put it on a link or form to ask before sco-pe sends the request; a submit button's own value overrides the form's value.

```html
<form action="/admin/users/12" method="post" data-confirm="Delete this user?"><button>Delete</button></form>
```

The handler is configurable when an application needs a custom dialog:

```js
Scope.configure({ confirmHandler: async (message) => window.confirm(message) });
```

Submit buttons can use native HTML overrides, including buttons outside the form:

```html
<form id="user-form" action="/admin/users" method="post">
  <input name="email">
  <button name="command" value="save">Save</button>
  <button name="command" value="preview" formaction="/admin/users/preview" formmethod="get">Preview</button>
</form>

<button type="submit" form="user-form" formaction="/admin/users/preview" formmethod="get">
  Preview outside the form
</button>
```

## Scroll behavior

By default, user-initiated navigation scrolls the document or scope to the top after the swap:

```html
<sco-pe id="main" scroll="top"></sco-pe>
```

Supported values:

```txt
top   scroll the scope/document to the top
keep  preserve scroll positions for the document, scope, and scroll containers with stable ids
none  do not scroll
hash  focus and reveal the URL hash target when present
```

To preserve a replaced scroll container, give it a stable `id`. Same-document hash links are not fetched; sco-pe leaves native navigation intact and only focuses the hash target for accessibility.

## Autosubmit

Use `autosubmit="300"` on the scope for live GET filters:

```html
<sco-pe id="users" src="/admin/users" history="true" autosubmit="300">
  <form action="/admin/users" method="get">
    <input name="q">
  </form>
</sco-pe>
```

Only GET forms are autosubmitted. The URL is updated with `history.replaceState()` to avoid creating a history entry for every keystroke.

Combine with `scope-swap` to replace only the result container, keeping the
form intact and avoiding focus loss:

```html
<sco-pe id="catalog" src="/catalog" autosubmit="250" scope-swap="#product-list">
  <form action="/catalog" method="get">
    <label>Filter <input name="q"></label>
  </form>
  <div id="product-list"><!-- replaced by server response --></div>
</sco-pe>
```

The server returns only the replacement fragment, not the full scope wrapper.

`scope-swap` fails closed: the local target must exist and the response must
contain exactly one root element, otherwise the swap errors with `scope:error`
and nothing is replaced. There is never a silent fallback to a full-scope
swap. When the focused element lives in the scope but outside the swapped
child, focus is left alone; only a removed focus target falls back to the
`focus` policy.

## Timeouts and synchronization

Every request has a configurable timeout, `60000` ms by default. Override it per scope or globally:

```html
<sco-pe id="main" src="/reports" timeout="10000"></sco-pe>
```

```js
Scope.configure({ timeout: 30000 });
```

A timed-out request reports `timedOut: true` in `scope:error`, runs `onError`, and releases the busy state. Asset waits (styles, scripts, registered components) share the same deadline. `import()` cannot be aborted, so a timed-out module load stops blocking the operation while the module itself keeps resolving in the background.

The default is `sync="auto"`: safe methods (`GET`, `HEAD`) replace the
in-flight request, which fits search and filtering, while unsafe methods are
dropped while a request is in flight so a cancellation never races a server
write already received. The submitter is disabled during the request, so the
normal double-click case is already covered.

```html
<sco-pe id="account" src="/account" sync="queue"></sco-pe>
```

```txt
auto     safe methods replace, unsafe methods drop (default)
replace  cancel the in-flight request and start the new one
queue    run the latest waiting navigation once the in-flight request settles
drop     ignore new navigations while a request is in flight
```

`auto` on an unsafe method and explicit `drop` emit `scope:sync-dropped`.
`queue` keeps at most one pending intent: a newer waiting navigation replaces
the older waiting one (latest-pending, not a FIFO). Because cancelling a fetch
does not undo a server mutation, keep the `auto` default or choose `queue` /
`drop` explicitly for POST forms.

## Keep expensive widgets

`keep="same-html"` preserves matching keyed custom elements when the server renders the same HTML again. This keeps client-side state for expensive widgets while still replacing them when their server-rendered HTML changes.

```html
<sco-pe id="main" keep="same-html" keep-selector="admin-rich-select, admin-map">
  <admin-rich-select id="department" name="department"></admin-rich-select>
</sco-pe>
```

If `keep-selector` is omitted, the default candidates are custom elements with stable `id`s. sco-pe compares the server HTML snapshot, not client-side mutations made after upgrade.

`keep` is intentionally an island-preservation feature, not a general-purpose DOM morphing API. `keep` may use DOM reconciliation internally, but sco-pe does not expose a general-purpose morphing contract. Use stable, unique ids and keep the selector narrow. Regular server markup around the widget is still updated, including validation errors and reordered keyed islands.

Preserved keyed custom elements retain identity when no reordering is required. Reordering may cause disconnect/reconnect on engines without `Element.moveBefore()`, currently including the WebKit engine covered by the test suite.

## Transitions

`transition="fade"` keeps a temporary outgoing layer during swaps:

```html
<sco-pe id="main" transition="fade" transition-timeout="250"></sco-pe>
```

The generated outgoing layer:

```txt
.scope-outgoing
part="outgoing"
inert
aria-hidden="true"
```

You own the CSS animation. sco-pe only provides lifecycle hooks and removes the outgoing layer after `transitionend`, `animationend`, or the timeout.
The outgoing copy has its descendant `id`s removed to avoid duplicate document ids; transition-aware modules should therefore remain idempotent.
Transitions are cosmetic and do not keep the request busy. A newer swap cancels and removes any outgoing layer still playing.

For a small default busy indicator, applications can use:

```css
sco-pe[busy]::after { content: "Loading…"; display: block; padding: .5rem; }
sco-pe[aria-busy="true"] { opacity: .65; cursor: progress; }
```

```css
sco-pe[transitioning] .scope-outgoing-fade {
  animation: scope-fade-out .2s ease both;
}

@keyframes scope-fade-out {
  to { opacity: 0; }
}
```

## Revalidation state

There is no cache/revalidation engine. The runtime only exposes state for explicit reloads:

```js
document.querySelector("sco-pe#main").revalidate()
```

During the request the scope gets:

```txt
revalidating
.is-revalidating
aria-busy="true"
```

## Renderable responses

`sco-pe` only renders HTML responses by default. Accepted content types are `text/html` and `application/xhtml+xml`. Non-HTML responses are refused before swapping, while `Scope-Status` and `Scope-Alert` headers may still be announced. Override `renderableResponse(response)` only for trusted, deliberate cases.

## Error responses

HTML error responses, including 5xx responses, are swapped into the scope so the server can render a useful recovery page. `204` and `304` complete without swapping; `205` completes without swapping and reports `reset: true` as a signal only — sco-pe never resets forms automatically. Cancel a swap when the application needs a different policy:

```js
document.addEventListener("scope:before-swap", (event) => {
  if (event.detail.status >= 500) event.preventDefault();
});
```

## Response headers

The server may declare response behavior with `Scope-*` headers:

```http
Scope-Status: User saved
Scope-Alert: Please fix the highlighted fields
Scope-Title: Users
Scope-Location: /admin/login-form
Scope-Redirect: /admin/login
Scope-Reload: true
Scope-Script: /assets/admin/user-form.js
Scope-Style: /assets/admin/user-form.css
Scope-Select: sco-pe#main
Scope-Target: sidebar
```

`Scope-Script` loads external ES modules with dynamic `import()`. Modules are deduped by absolute URL. Inline scripts from fetched HTML are ignored by design.

The full endpoint contract — dual representation, `422` validation, `204` /
`205` / `304`, `Vary: Scope-Request`, CSRF, `scope-swap` and concurrency rules,
plus a framework-neutral PSR-7 example — lives in
[the server contract](docs/server-contract.md). Security notes (trust model,
CSP, Trusted Types status) live in [security.md](docs/security.md).

## Asset loading

Prefer headers when the controller knows what the response requires:

```php
$response->headers->set('Scope-Script', '/assets/admin/rich-editor.js');
$response->headers->set('Scope-Style', '/assets/admin/rich-editor.css');
```

Custom elements can be registered up front:

```js
customElements.whenDefined("sco-pe").then(() => {
  customElements.get("sco-pe").configure({
    components: {
      "admin-datepicker": "/assets/admin/datepicker.js",
      "admin-combobox": "/assets/admin/combobox.js",
    },
  });
});
```

When a fetched scope contains an undefined registered custom element, sco-pe imports the mapped module and waits for the element to be defined.

Asset declarations intentionally stay out of fetched markup. Use `Scope-Script` / `Scope-Style` when the server discovers dependencies at render time, or the component registry when the mapping is known by the application. A registered module must define its custom element during module evaluation; otherwise the load fails with a clear error instead of remaining busy indefinitely.

Fetched `<script>`, `<style>`, and stylesheet `<link>` elements are removed. Load executable or global styling dependencies through `Scope-Script` / `Scope-Style`. This is not an HTML sanitizer: responses are trusted same-origin application HTML, so inline event attributes and URLs remain the server application's responsibility.

## Accessibility contract

`sco-pe` manages the scope lifecycle, not arbitrary announcements:

- sets `aria-busy="true"` while the scope is loading;
- sets `aria-busy="false"` after the load finishes;
- updates configured status/alert regions from `Scope-Status`, `Scope-Alert`, or in-scope `role="status"` / `role="alert"`;
- focuses `[autofocus]`, the main heading, the error summary, or the first invalid field depending on `focus` and response status;
- keeps same-document hash links native and focuses the revealed target;
- allows `focus="none"` and `announce="none"` for silent/background updates.

Recommended base layout:

```html
<div id="scope-status" role="status" aria-live="polite" aria-atomic="true"></div>
<div id="scope-alert" role="alert" aria-atomic="true"></div>
```

Recommended validation response:

```html
<form action="/admin/users" method="post" aria-describedby="form-errors">
  <div id="form-errors" role="alert" tabindex="-1">
    Please fix the highlighted fields.
  </div>

  <label for="email">Email</label>
  <input id="email" name="email" aria-invalid="true" aria-describedby="email-error">
  <p id="email-error">Email is required.</p>
</form>
```

## Lifecycle events

```js
document.addEventListener("scope:before-load", (event) => {
  // event.preventDefault() cancels the load.
});

document.addEventListener("scope:before-swap", (event) => {
  // event.preventDefault() cancels the swap.
});

document.addEventListener("scope:after-swap", (event) => {});
document.addEventListener("scope:load", (event) => {});
document.addEventListener("scope:error", (event) => {});
document.addEventListener("scope:status", (event) => {});
document.addEventListener("scope:alert", (event) => {});
document.addEventListener("scope:transition-start", (event) => {});
document.addEventListener("scope:transition-end", (event) => {});
```

Configuration callbacks follow the same ownership rule:

```txt
afterLoad(scope, detail)  runs for every scope whose lifecycle completes
onLoad(scope, detail)     compatibility callback, once on the request-owning source scope
onError(scope, detail)    runs for non-abort request errors on the source scope
```

`scope:load` details distinguish transport success from rendering:

```txt
ok        true only for a successful HTTP response (304 also counts as unchanged success)
rendered  true when HTML was actually swapped into a scope
status    the HTTP status when a response was received
source    id of the scope that owns the request
target    id of the scope that owns the swap
```

A rendered `422` therefore reports `{ ok: false, rendered: true }`.

When `Scope-Target` routes a response to another scope, the source owns the request, history, and active navigation. The target owns the swap, focus, announcement, `scope:before-swap`, and `scope:after-swap`. Both source and target receive `scope:load`, with `source` and `target` in the event detail.

`stripHash` normalizes `/users/` and `/users` as the same URL for active-link and history comparisons.

History state stores one owning scope per browser entry. In a multi-scope admin layout, enable navigational history on the main content scope and update secondary scopes through `Scope-Target`.

## Tests

```sh
bun install
bunx playwright install chromium
bun test
```

The test suite covers initial `src` loading, link navigation, GET forms, 422 validation errors, live status/alert updates, focus management, same-document hash focus, scroll policies, non-HTML response refusal, native submitter overrides, external submit buttons, `Scope-Script` custom-element upgrades, autosubmit, keep, transitions, and revalidation state.

## Demos

Run `bun run serve` and open [`/static/index.html`](http://127.0.0.1:4173/static/index.html) for small working examples. See [the demo guide](docs/demos.md) for what each page demonstrates.
