# Upgrade notes for the proposed 0.2 rewrite

## What changed

The old implementation tried to be a small page loader: it parsed response scripts/styles, executed inline scripts, coordinated global script queues, replaced fragments conditionally, and used `X-*` headers. The proposed runtime is narrower:

- scoped fetch + swap;
- per-scope aborts;
- behavior attributes on `<sco-pe>`;
- `Scope-*` headers;
- external asset loading only;
- accessibility lifecycle;
- lifecycle events;
- tests first;
- renderable content-type checks;
- explicit scroll and focus policy;
- native submitter semantics;
- optional autosubmit, keep, transitions and revalidating state.

## No public `data-scope-*` API

Behavior now lives on the custom element:

```html
<sco-pe id="main" src="/admin/users" history="true" scroll="top" focus="auto"></sco-pe>
```

Inside the scope, prefer native HTML:

```html
<a href="/admin/users?page=2">Next</a>

<form action="/admin/users" method="post">
  <button formaction="/admin/users/preview" formmethod="get">Preview</button>
</form>
```

The previous `data-scope-*` patterns are not part of the proposed public API, except for the deliberately narrow `data-confirm` convention on links, forms, and submit buttons.

| Previous pattern | 0.2 replacement |
| --- | --- |
| `data-scope-action`, `data-scope-method` | Native `action`, `method`, `formaction`, `formmethod` |
| `data-scope-scroll`, `data-scope-focus` | `scroll`, `focus` on `<sco-pe>` |
| `data-scope-status`, `data-scope-alert` | `Scope-Status`, `Scope-Alert` headers or live regions |
| `data-scope-assets` | `Scope-Script`, `Scope-Style`, or the custom-element registry |
| `data-scope-confirm` | `data-confirm` on the form/link; submitters may override it |
| `data-scope-fragment` | `select` on `<sco-pe>` or `Scope-Select` response header |
| `data-scope-on` | `scope:*` lifecycle event listeners |

## Header rename

Old names:

```txt
X-Status
X-Title
X-Reload
X-Location
X-include-css
X-include-js
```

New names:

```txt
Scope-Status
Scope-Alert
Scope-Title
Scope-Reload
Scope-Location
Scope-Redirect
Scope-Style
Scope-Script
Scope-Select
Scope-Target
```

`Scope-Location` means “load this URL into the current scope”. `Scope-Redirect` means “perform a full browser redirect”.

`Scope-Select` extracts the selected element's content, not its wrapper. When `Scope-Target` routes a response to another scope, the original scope still owns history and active-link state.

## Scripts

Fetched script and style assets are removed. Use one of these instead:

1. `Scope-Script: /assets/admin/form.js`;
2. registered custom element modules through `components` config;
3. lifecycle event listeners registered by a loaded module.

Modules should be idempotent. A good module registers custom elements or event handlers. It should not assume it runs once per partial swap.

There is intentionally no asset declaration attribute on native HTML elements. Dynamic requirements belong in response headers; known custom-element mappings belong in JavaScript configuration.

The old global `onLoad` callback remains as a compatibility hook and now runs once on the request-owning source scope. Use `afterLoad` or `scope:load` for per-scope work, including `Scope-Target` updates.

## Accessibility and navigation

The new runtime treats accessibility as core behavior:

- `aria-busy` while loading;
- status and alert live regions;
- focus restoration after swaps;
- same-document hash links keep native navigation and focus the target;
- first-class 400/422 validation behavior.

Scroll behavior is explicit through `scroll="top|keep|none|hash"` on `<sco-pe>`. Use `keep` for refreshed tables or scroll containers with stable ids.

## Autosubmit

Use `autosubmit="300"` on the scope for GET filter forms. POST forms are not autosubmitted.

## Scope-swap

Use `scope-swap="#child-selector"` to replace a specific child element instead
of the entire scope content. The server returns only the replacement fragment;
the rest of the scope (form fields, navigation) is never touched. This avoids
focus loss and race conditions on input values during live filter patterns.

```html
<sco-pe id="catalog" src="/catalog" autosubmit="250" scope-swap="#product-list">
  <form action="/catalog" method="get">
    <label>Filter <input name="q"></label>
  </form>
  <div id="product-list"><!-- replaced by server response --></div>
</sco-pe>
```

The server response for this scope is just:

```html
<div id="product-list"><p>Results matching "key"</p><p>Keyboard</p></div>
```

Unlike `keep="same-html"`, no morphing, snapshotting or id-matching is involved
— the target element is directly replaced with the first element child of the
server response.

## Keep

Use `keep="same-html"` to preserve expensive custom elements when the server renders the same HTML snapshot. Add `keep-selector="..."` when the default “custom elements with id” rule is too broad or too narrow.

This is an exact keyed-island feature, not a general morphing contract. Stable ids are required, and changed server HTML still replaces the widget.

## Transitions

Use `transition="fade"` and CSS targeting `.scope-outgoing` / `part="outgoing"`. The outgoing layer is `inert` and `aria-hidden` while it plays out.

## Revalidation state

There is no cache in this starter. Call `scope.revalidate()` to reload and mark the scope with `revalidating` / `.is-revalidating` while the request is in flight.

## Response safety

Only HTML responses are rendered by default (`text/html` or `application/xhtml+xml`). This mirrors the hardening seen in mature fragment frameworks and prevents accidental injection of non-HTML uploads or JSON responses.

HTML error pages, including 5xx responses, are intentionally swapped. Prevent `scope:before-swap` when the application needs to keep its current content instead.

Lifecycle details now separate HTTP success from DOM rendering. A rendered validation response can report `ok: false` and `rendered: true`.

## URL normalization

For active links and client history, sco-pe treats `/users/` and `/users` as equivalent after removing a hash. Preserve a meaningful trailing slash in server routes if the distinction matters outside sco-pe.

## Suggested migration path

1. Replace old headers with `Scope-*` headers.
2. Move fragment inline scripts to modules.
3. Add the status and alert regions to the admin layout.
4. Move behavior attributes to `<sco-pe>`.
5. Use native form/button attributes for submitter variants.
6. Port one representative CRUD flow and make the tests pass.
7. Add `scroll="keep"`, `autosubmit`, `keep`, `transition`, or `revalidate()` only where the admin actually needs them.
