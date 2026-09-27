# Targeting and refresh

## Prefer the smallest mechanism

Use this order:

```text
whole scope
scope-swap
Scope-Event + revalidate()
Scope-Target
multi-target, only if implemented and justified
```

Each step adds coordination. Do not start at the bottom.

## `scope-swap`

Use `scope-swap` when one child inside a scope should be replaced while surrounding state survives.

```html
<sco-pe
  id="catalog"
  autosubmit="250"
  scope-swap="#product-list"
>
  <form action="/catalog" method="get">
    <input name="q">
  </form>

  <div id="product-list">...</div>
</sco-pe>
```

Important contract:

- the selector is resolved **inside the receiving scope**;
- the local target must exist;
- the response must have the required single replacement root;
- failure is explicit;
- there is no silent fallback to replacing the whole scope.

Do not use it as arbitrary document-wide targeting.

## `Scope-Target`

Use `Scope-Target` when the **whole response** belongs to another existing scope.

```text
source
  owns request, cancellation, history

target
  owns DOM swap, focus, announcement
```

When a target starts a newer navigation before an older routed response lands, the newer intent must win.

## Scope `target` attribute

A source scope can declare that its navigations land elsewhere:

```html
<sco-pe id="sidebar" target="main">
  ...
</sco-pe>

<sco-pe id="main" history="true">
  ...
</sco-pe>
```

Use this when source and destination are stable navigation concepts, not merely to compensate for an incorrectly small scope.

## `Scope-Event`

Use `Scope-Event` for domain facts:

```http
Scope-Event: appointment.changed, patient.timeline.changed
```

Consumer:

```js
document.addEventListener("scope:event", (event) => {
  if (event.detail.name === "appointment.changed") {
    calendar.refetch();
  }
});
```

Keep events payload-free, semantic and independent of a particular DOM selector.

Good:

```text
appointment.changed
patient.timeline.changed
notifications.changed
```

Avoid:

```text
reload-sidebar-with-id-42
set-count-to-7
execute-this-js
```

The event announces a fact; the client decides what it means locally.

## `revalidate()`

Use `scope.revalidate()` for an explicit refresh of a scope.

It is not an application cache API. A secondary scope reacting to `Scope-Event` is often simpler than a multi-target response.

## Multi-target design documents

Some sco-pe versions may contain `docs/multi-target.md` before the runtime implements `<scope-partial>`.

Treat design docs as design.

Before authoring:

```html
<scope-partial target="...">
```

verify the installed source and release notes actually support it.

When multi-target exists, preserve the same architectural rule:

> use it only for independent scopes that occasionally need the same server response.

Do not use it to reconstruct one page from many artificially separate fragments.
