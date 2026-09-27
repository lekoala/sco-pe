# Mental model and scope boundaries

## One sentence

A `<sco-pe>` is a **navigation context for ordinary server-rendered links and forms**.

It is not a component framework, store, router DSL, overlay manager or client renderer.

## Native first

Inside a scope, prefer ordinary HTML:

```html
<a href="/patients?page=2">Next</a>

<form action="/patients" method="get">
  <input name="q">
  <button>Search</button>
</form>

<form action="/patients/42/archive" method="post">
  <button>Archive</button>
</form>
```

Keep native submitter overrides:

```html
<button
  type="submit"
  formaction="/patients/preview"
  formmethod="get"
>
  Preview
</button>
```

Do not create JavaScript-only action buttons when a link or form already expresses the operation.

## Where policy lives

```text
<sco-pe> attributes       navigation policy
native HTML               semantics and request intent
Scope-* response headers  server response policy
custom elements/modules   product behavior
```

`data-confirm` is the deliberate leaf-level exception because confirmation belongs to one action.

Do not invent a general `data-scope-*` interaction language.

## Choosing a boundary

Ask what normally changes as one navigation.

Good single-scope candidates:

```text
page heading
breadcrumbs
tabs / subtabs
main content
page-local toolbar
```

If these always describe the same route, splitting them into independent scopes creates synchronization work for no benefit.

Independent scopes make sense when a region has its own lifecycle:

```text
persistent notification count
independent dashboard tile
server-loaded dialog host
side panel with its own navigation
```

## Same scope first

When someone reports stale breadcrumbs, stale tabs or stale navigation after an update, first ask whether the update boundary is too small.

Do not immediately add:

- another response target;
- a domain event;
- a second fetch;
- multi-target coordination.

A larger, semantically correct navigation scope is usually simpler.

## What stays outside sco-pe

Keep these in dedicated owners:

```text
modal/dialog lifecycle       -> dialog component / platform
combobox/date picker         -> custom element / widget library
client-only state machine    -> application module
notifications transport      -> application/service layer
visual styling               -> CSS/design system
application cache            -> HTTP/browser/service worker/app layer
```

The boundary is intentionally architectural, not merely a package-size optimization.
