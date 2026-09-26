# Multiple scope updates per response

Status: designed, not implemented. `Scope-Target` routes a whole response to a
single other scope, which remains the current model.

Implement only when a representative application flow requires one response to
update multiple independent scopes and the simpler path is not good enough.

Try first: route the main response with `Scope-Target` (or a larger scope),
emit `Scope-Event`, and let secondary scopes call `revalidate()`. The reload
request carries `Scope-Target` set to the reloading scope, so the server can
render just that region, even for a scope without its own `src`. Multi-target
only saves that extra request and the short visual gap between the updates.

## Same scope first

Most "stale surroundings" problems disappear when the unit of update is a
navigation context rather than an element. If breadcrumbs, tabs and content
normally change together, they belong to the same scope, and a plain swap keeps
them consistent.

Multi-target is for **independent** scopes that occasionally need to be updated
by the same response. Prefer, in order:

```txt
normal browser navigation
whole scope swap
scope-swap
Scope-Event / revalidate      interested consumers refetch themselves
Scope-Target                  the whole response belongs to another scope
<scope-partial>               one response, several independent scopes
```

`<scope-partial>` and `Scope-Event` answer different questions and coexist:

```txt
<scope-partial>   "I already have the new HTML. These regions are part of
                   this response contract."
Scope-Event       "A domain fact happened. Interested consumers may react."
```

A region that may or may not be on the page is either a `Scope-Event`
consumer or an `optional` partial (see Optional partials).

## Wire format

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
- `<scope-partial>` is an inert response marker, not a custom element. The
  wrappers are stripped and never inserted into the DOM.
- Partials are committed in document order.

## Precedence

- When the body contains at least one `<scope-partial>`, it defines every
  target. A `Scope-Target` response header is ignored for that response.
- When the body contains none, the existing behavior applies unchanged.

No opt-in attribute is required: `<scope-partial>` is inert today, so parsing it
only changes responses that already use the tag.

## Roles

```txt
source              the scope that owns the request: fetch, cancellation,
                    sync policy, history entry
navigation target   where the navigation is meant to land:
                    the source's `target` attribute, else the source itself
primary target      the partial aimed at the navigation target, or none
affected targets    every scope named by a partial
```

Example: `<sco-pe id="sidebar" target="main">` is clicked and the response
updates `breadcrumbs`, `sidebar` and `main`. The source is `sidebar`, the
navigation target and primary target are `main`.

The primary target is derived on the client, never declared by the server.
It can be absent: a POST from `main` answered only with a `stats` partial has
`main` as navigation target and no primary target, so no focus or scroll policy
runs.

## Pipeline

The same pipeline serves a local swap, `Scope-Target` and multi-target. The
multi-target path only orchestrates several uses of it.

```txt
1. PREPARE (async)
   parse partials, resolve targets, validate the whole response
   claim target operations
   load Scope-Script / Scope-Style and registered components
   build every replacement fragment
   dispatch scope:before-swap on every target

   ─────────── no await below this line ───────────

2. COMMIT (sync)
   re-check operations and intents, then swap every target in document order

3. SETTLE
   focus / scroll on the primary target only
   announcements, scope:after-swap, scope:load, Scope-Event
   release busy states, history entry
```

Because the commit phase never awaits, the browser does not render between two
target swaps: the user never sees half of a coordinated update. This is not a
DOM transaction with rollback. Before-swap listeners may have run side effects,
which is why `scope:before-swap` is a veto and preparation hook, not a place to
mutate the application.

## Failure rules

Three kinds of failure, three outcomes.

**Invalid response: nothing is committed.** The response is refused as a whole
when any of these holds, and the source reports `scope:error`:

- a required target does not exist or is not a `<sco-pe>` (see Optional
  partials);
- the same target appears twice;
- a `select` matches nothing;
- a target's `scope-swap` contract is not met (missing local child, not exactly
  one root element);
- an asset or registered component fails to load.

This matches `Scope-Target` (unknown target throws) and `scope-swap` (fails
closed). A partially applied response is exactly the stale-navigation state
this feature exists to prevent.

**Veto: nothing is committed.** Any `scope:before-swap` calling
`preventDefault()` cancels the whole response, reported as aborted.

**Supersession: depends on which target moved on.** A target is superseded when
the user started a navigation on it after this request started (the intent
check `Scope-Target` already uses), or when a newer operation claimed it during
prepare.

- Navigation target superseded, whether or not it has a partial: abandon the
  whole response. Its breadcrumbs and active states describe a page the user
  has left.
- Secondary target superseded: skip that target, commit the others.

## Operation ownership

- A target other than the source claims its own operation token, exactly like
  `Scope-Target` does today.
- A partial targeting the source (`_self` or its id) **reuses the source's
  token**. Claiming it again would abort the request producing the response.
- All tokens are claimed during prepare, before any async work, and all are
  re-checked at the start of commit.

## Busy state

- Every affected target is busy from its claim until settle.
- The source stays busy until the whole response has settled.

## Events

- `scope:before-swap`, `scope:after-swap`, `scope:load` and `scope:error` fire
  per target with `source` and `target` in the detail, as in the current
  cross-target contract.
- The source emits one additional `scope:load` carrying a summary:

  ```js
  { source, target: "main", primary: "main", targets: [{ id, ok, rendered, status }] }
  ```

- `afterLoad` runs per affected scope. `onLoad` runs once, on the source.
- `Scope-Event` names are dispatched once, on the primary target, or on the
  source when there is no primary target.

## Focus and accessibility

- The primary target applies its own `focus` and `scroll` policy.
- Other targets do not move focus or scroll. When a swap removes the focused
  element from a secondary target, focus falls back to that target's policy so
  it is never lost to `<body>`.
- `Scope-Status` / `Scope-Alert` are announced once, not per target.

## History

- The source produces at most one history entry, with the request URL, as
  today. The entry records the navigation target, like any targeted navigation.
- Back/forward refetches that URL. The server answers the restoration request
  as it answered the original one, so the same partials come back.
- Partials never push or replace history on their own.

## Request context

Every sco-pe request already tells the server who asked and where the
navigation lands (see the server contract):

```http
Scope-Request: true
Scope-Source: sidebar
Scope-Target: main
```

The server uses them to decide which partials to emit. A response that depends
on them must list them in `Vary` or be uncacheable.

## Optional partials

The server chooses the partials but cannot see the client's layout: a region
such as `stats` may exist on some pages and not on others. A partial may be
marked optional:

```html
<scope-partial target="stats" optional>
  ...
</scope-partial>
```

The escape hatch is deliberately narrow:

- an optional partial is skipped **only when no scope with that id exists** in
  the document;
- every other failure stays fail-closed: a `select` that matches nothing, an
  unmet `scope-swap` contract, a duplicate target;
- a partial aimed at the navigation target is never optional; `optional` on it
  is ignored.

Use `optional` when the server already has the HTML and a second request would
be waste. When the region can fetch its own content, `Scope-Event` remains the
simpler choice.

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

Response to a form POST from `main`:

```html
<scope-partial target="main">
  <h1>Orders</h1>
  <p>Order created.</p>
</scope-partial>
<scope-partial target="stats" select="#totals">
  <div id="totals">43 orders</div>
</scope-partial>
```

Result: `#main` swaps and applies its focus policy, `#stats` shows `43 orders`
without moving focus, and browser history gained a single entry owned by
`#main`.

## Implementation order

1. Split `processParsedResponse` into prepare / commit / settle with no
   observable change. Local swaps, `Scope-Target` and `scope-swap` keep passing
   their existing tests.
2. Add `src/partials.js`: parse, validate and orchestrate several uses of that
   pipeline. `Scope` only detects the response shape and delegates.

## Deferred

- A `primary` attribute to override the derived primary target.
- Splitting the body through repeated or combined `Scope-*` headers.
- Per-target history entries and back/forward state.
- Ordering control beyond document order.
- Nested `<scope-partial>` elements.
- Progressive/streaming application of partials as they arrive.
- A grouping element (`<sco-pe-group>`): scopes are addressed by global id,
  as with `Scope-Target`, and affected regions rarely share a meaningful
  ancestor.

## Reference

htmx 4 `<hx-partial>` addresses the same problem with a declarative wrapper.
This design follows that direction while keeping sco-pe's per-scope operation
ownership, single history entry and fail-closed contracts.
