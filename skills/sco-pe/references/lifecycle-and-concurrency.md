# Lifecycle and concurrency

## Ownership

For an ordinary local navigation, one scope owns the complete lifecycle.

For routed navigation, separate source and target:

```text
source
  request
  cancellation
  sync policy
  history entry

target
  replacement
  focus
  scroll
  announcements
  swap lifecycle
```

When reading lifecycle details, inspect `source` and `target` rather than assuming the event receiver initiated the request.

## Lifecycle events

Use the installed README/source for the exact event list and detail shape.

Common lifecycle points include:

```text
scope:before-load
scope:before-swap
scope:after-swap
scope:load
scope:error
scope:event
scope:status
scope:alert
```

`scope:before-load` and `scope:before-swap` are veto points.

Do not put unrelated long-running application workflows into these events merely because they exist.

## HTTP success vs rendering

Keep two questions separate:

```text
ok
    was the HTTP result successful?

rendered
    was HTML actually written into a scope?
```

Examples:

```text
422 validation
    ok=false, rendered=true

204
    ok=true, rendered=false

render failure
    ok=false, rendered=false
```

Application code should choose the property that matches its actual need.

## Sync policy

Current public policies:

```text
auto
replace
queue
drop
```

Default `auto` is intentionally method-sensitive:

```text
safe reads       -> replace old in-flight read
unsafe mutation  -> drop overlapping new mutation
```

Why: aborting a fetch cannot retract a mutation after the server has received it.

Avoid `sync="replace"` for unsafe requests unless the server operation is explicitly designed to tolerate that behavior.

`queue` is latest-pending, not a FIFO. Do not build business sequencing assumptions on it.

## Newer intent wins

A stale response must not overwrite a newer navigation.

This matters both for:

- two requests from the same scope;
- a response routed into a target that has since navigated itself.

When changing concurrency internals, test slow/fast arrival permutations, not only the happy path.

## Prepare / commit / settle

For swap implementation work, prefer three conceptual phases:

```text
PREPARE (async)
  parse
  resolve target
  validate contract
  load dependencies
  build fragment
  before-swap veto
  operation checks

COMMIT (sync)
  mutate DOM

SETTLE
  focus
  scroll
  announce
  events
  history/lifecycle completion
```

The value is not abstract purity. It keeps fallible async work out of the mutation window and makes coordinated updates safer.

Do not claim true transactional DOM rollback; event listeners and runtime exceptions can still have side effects.

## History

One navigation should normally create at most one browser history entry.

In multi-scope layouts, choose a primary history-owning navigation scope.

Back/forward restoration must land content in the same effective target as the original navigation.

Do not let secondary status/widgets create history merely because they refresh.

## Tests worth keeping

When a navigation change touches lifecycle/concurrency, cover:

- two fast GET navigations;
- slow old GET + fast new GET;
- double unsafe submit;
- `queue` latest-pending behavior;
- routed response vs newer target navigation;
- canceled `before-load`;
- canceled `before-swap`;
- back/forward;
- target detach/reconnect where relevant;
- asset/component loading delaying a stale response.
