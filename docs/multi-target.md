# Multiple scope updates per response

Status: deferred beyond v0.2.

Implement only when a representative application flow requires one response to
update multiple independent scopes and `Scope-Target` would otherwise require
an additional request or application-specific glue. `Scope-Target` currently
routes a whole response to a single other scope, which remains the v0.2 model.

## Motivation

A single user action often changes more than one region: a list and its counter,
a row and a total, a table and a flash message. One response body must be able
to update several scopes without follow-up requests.

## Wire format

Multiple targets are declared with `<scope-partial>` wrappers in the response
body:

```html
<scope-partial target="main">
  <h1>Orders</h1>
  ...
</scope-partial>
<scope-partial target="stats" select="#totals">
  <div id="totals">42 orders</div>
</scope-partial>
```

- `target` (required) is a scope id. `_self` refers to the source scope.
- `select` (optional) extracts the matched element's content, with the exact
  semantics of `Scope-Select` (`selected.innerHTML`, not the wrapper).
- `<scope-partial>` is a client-only marker. The wrappers are stripped before
  swap and never inserted into the DOM.
- Partials are processed in document order.

## Precedence

- When the body contains at least one `<scope-partial>`, it defines every
  target. Any `Scope-Target` header is ignored for that response.
- When the body contains none, the existing behavior applies unchanged:
  `Scope-Target` routes the whole body to one scope, or the source swaps it.

No opt-in attribute is required: `<scope-partial>` is inert today, so parsing it
only changes responses that already use the tag.

## Swap rules

- `select` extracts content from the partial payload.
- The target's own `scope-swap` attribute then decides which child receives the
  extracted content; otherwise the target scope's content is replaced.
- The source scope's content is not replaced unless a partial targets `_self`
  or no partial is present.

## Ownership and history

- The **source scope** owns the request, cancellation, and history entry. It
  keeps its `history="true"` behavior and produces exactly one history entry
  using the source URL.
- Each **target scope** claims its own operation token, using the same mechanism
  as `Scope-Target`. A newer local navigation on a target invalidates that
  target's partial only; it never aborts the source or the other targets.
- **All targets are claimed before the first swap**, so a partial rendered early
  cannot be overwritten by one rendered later in the same response.
- Partials never push or replace history on their own.

## Failure isolation

- A partial whose target does not exist is skipped. The remaining partials still
  apply.
- A partial whose target was superseded before its swap is skipped silently.
- A partial that throws reports `scope:error` on its target and releases that
  target's busy state. The other partials continue.
- Swaps are applied sequentially and are not rolled back: a later failure leaves
  earlier swaps in place.

## Busy state

- Each target is busy (`aria-busy="true"`, `[busy]`) while its own partial is
  being applied.
- The source is busy until every partial has settled, then it is released once.

## Events

- `scope:load` / `scope:error` fire per target, with `source` and `target` set as
  in the current cross-target contract.
- The source emits one additional `scope:load` whose detail carries a `targets`
  summary so integrations get a single completion signal:

  ```js
  { source, target: "main", targets: [{ id, ok, rendered, status }] }
  ```

- `afterLoad` runs per affected scope. `onLoad` runs once, on the source.

## Focus and accessibility

- Focus follows the source scope's `focus` policy. Partial targets do not move
  focus and do not announce through the source's live regions beyond their own
  `Scope-Status` / `Scope-Alert` handling.
- Every target keeps its existing accessibility contract; the source's busy and
  status behavior is unchanged.

## Security

Responses are trusted same-origin application HTML. As today, fetched
`<script>`, `<style>` and stylesheet `<link>` elements are removed; executable
dependencies go through `Scope-Script` / `Scope-Style`.

## Example

Initial document:

```html
<sco-pe id="main" src="/admin/orders" history="true"></sco-pe>
<sco-pe id="stats"></sco-pe>
```

Response to a form POST:

```html
<scope-partial target="main">
  <h1>Orders</h1>
  <p>Order created.</p>
</scope-partial>
<scope-partial target="stats" select="#totals">
  <div id="totals">43 orders</div>
</scope-partial>
```

Result: `#main` swaps its content, `#stats` shows `43 orders`, and browser
history gained a single entry owned by `#main`.

## Deferred beyond v0.2

- Splitting the body through repeated or combined `Scope-*` headers.
- Per-target history entries and back/forward state.
- Ordering control beyond document order.
- Nested `<scope-partial>` elements or partial-in-partial composition.
- Progressive/streaming application of partials as they arrive.

## Reference

htmx 4 `<hx-partial>` addresses the same problem with a declarative wrapper and
an explicit ordering rule. This specification follows that direction while
keeping sco-pe's per-scope operation ownership and single-history model.
