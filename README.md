# sco-pe

Scoped navigation for server-rendered apps.

`sco-pe` is an autonomous custom element. It progressively enhances regular links and forms inside a scoped region: requests are fetched, matching server-rendered HTML is swapped back into the scope, and regular navigation still works without JavaScript.

This branch is a proposed `0.2` rewrite direction. It intentionally keeps the public surface small: behavior is configured on `<sco-pe>`, response behavior comes from `Scope-*` headers, and richer client-side behavior comes from external modules or custom elements.

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
keep                none|same-html
keep-selector       optional selector for kept same-html elements
transition          none or a CSS mode name, e.g. fade
transition-timeout  fallback duration in ms
disabled            leave links and forms to the browser (unless exactly "false")
```

`select` always extracts the selected element's *content*, rather than injecting the selected wrapper element.

## Confirmation

`data-confirm` is the one supported data attribute. Put it on a link or form to ask before sco-pe sends the request; a submit button's own value overrides the form's value.

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

## Keep expensive widgets

`keep="same-html"` preserves matching custom elements when the server renders the same HTML again. This keeps client-side state for expensive widgets while still replacing them when their server-rendered HTML changes.

```html
<sco-pe id="main" keep="same-html" keep-selector="admin-rich-select, admin-map">
  <admin-rich-select id="department" name="department"></admin-rich-select>
</sco-pe>
```

If `keep-selector` is omitted, the default candidates are custom elements with stable `id`s. sco-pe compares the server HTML snapshot, not client-side mutations made after upgrade.

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

HTML error responses, including 5xx responses, are swapped into the scope so the server can render a useful recovery page. Cancel that swap when the application needs a different policy:

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

## Asset loading

Prefer headers when the controller knows what the response requires:

```php
$response->headers->set('Scope-Script', '/assets/admin/rich-editor.js');
$response->headers->set('Scope-Style', '/assets/admin/rich-editor.css');
```

Templates can also declare assets locally:

```html
<template scope-assets>
  <link rel="stylesheet" href="/assets/admin/uploader.css">
  <script type="module" src="/assets/admin/uploader.js"></script>
</template>
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

`stripHash` normalizes `/users/` and `/users` as the same URL for active-link and history comparisons. If a response is routed with `Scope-Target`, history and active links remain owned by the scope that initiated the request.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

The test suite covers initial `src` loading, link navigation, GET forms, 422 validation errors, live status/alert updates, focus management, same-document hash focus, scroll policies, non-HTML response refusal, native submitter overrides, external submit buttons, `Scope-Script` custom-element upgrades, autosubmit, keep, transitions, and revalidation state.

## Demos

Run `npm run serve` and open [`/static/index.html`](http://127.0.0.1:4173/static/index.html) for small working examples. See [the demo guide](docs/demos.md) for what each page demonstrates.
