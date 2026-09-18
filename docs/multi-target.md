# Multiple scope updates per response

Status: design note, not implemented. `Scope-Target` currently routes a whole
response to a single other scope.

## Motivation

A single user action often changes more than one region: a list and its counter,
a row and a total, a table and a flash message. Today the server can only send
one response body, so applications either nest the extra content inside the
target scope or issue follow-up requests.

## Wire format

Two candidate shapes.

### A. Extended header

```http
Scope-Target: sidebar, stats
```

The body is split between the listed scopes. Splitting HTML by position is
fragile: the server needs unambiguous delimiters and the client must map each
fragment to a scope. Workable only with an explicit wrapper convention.

### B. Partial wrappers in the body (recommended)

```html
<scope-partial target="sidebar">
  <h2>Sidebar updated</h2>
</scope-partial>
<scope-partial target="stats" select="#totals">
  <div id="totals">42 orders</div>
</scope-partial>
```

Each partial carries its own target and optional selector, reusing the existing
`Scope-Select` semantics. Source scope content remains the default when no
partial wrapper is present, so today's responses keep working. `<scope-partial>`
is a client-only marker: it is never inserted into the DOM.

## Ownership and history

- The **source scope** owns the request, cancellation, and history entry. It
  keeps the existing `history="true"` behavior and single URL.
- Each **target scope** claims its own operation token (the mechanism already
  used for `Scope-Target`). A newer local navigation on any target invalidates
  that target's partial only; it must not abort the source or the other targets.
- Processing order follows document order of the partials. All targets are
  claimed before the first swap, so a partial rendered early cannot be
  overwritten by one rendered later.

## Failure isolation

- A partial whose target is missing or already superseded is skipped, not
  fatal: the remaining partials still apply.
- A throwing target reports `scope:error` scoped to that target and releases its
  own busy state. The source result aggregates per-target outcomes.
- The source busy state clears once every partial has settled.

## Events

- `scope:load` / `scope:error` fire per target, with `source` and `target` set
  as today.
- The source also emits a single `scope:load` with a `targets` summary
  (`[{ id, ok, rendered, status }]`) so integrations get one completion signal.
- `afterLoad` runs per affected scope; `onLoad` runs once on the source, matching
  the current cross-target contract.

## Scope of a first iteration

1. Parse `<scope-partial>` in `parseHTML` and strip the wrappers.
2. Generalize the `Scope-Target` branch into a loop over `{ target, select, html }`.
3. Claim every target before swapping any content.
4. Add isolation on failure and the aggregate source event.

## Open questions

- Should a partial be allowed to target the source scope itself for ordering?
- Do we need an explicit opt-in attribute (e.g. `multi-target`) to avoid
  changing behavior for responses that happen to contain the tag?
- How does `select` interact with `scope-swap` on a partial target?
- Accessibility: which target, if any, owns focus when several update at once.

## Reference

htmx 4 `<hx-partial>` solves the same problem with a declarative wrapper and an
explicit ordering rule. This design follows that direction while keeping
sco-pe's per-scope operation ownership and single-history model.
