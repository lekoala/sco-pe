# sco-pe and htmx 4

This is not a feature contest. Both projects start from a similar premise: keep the server in charge of HTML and make server-rendered applications feel fluid without turning the browser into a client-side rendering platform.

The important difference is **where interaction behavior lives**.

This document targets **htmx 4.0**, released on 2026-08-28.

## The short version

`sco-pe` treats a region of the page as a **navigation context**:

```html
<sco-pe id="main" history="true">
  <a href="/users?page=2">Next</a>

  <form action="/users" method="post">
    ...
  </form>
</sco-pe>
```

The descendants are ordinary HTML. The `<sco-pe>` boundary owns fetching, swapping, history, focus, announcements, synchronization and response handling.

htmx treats HTML elements as **declarative interaction endpoints**:

```html
<form
  action="/users"
  method="get"
  hx-action="/users"
  hx-target="#results"
  hx-select="#results"
  hx-swap="outerHTML"
>
  ...
</form>
```

The behavior is intentionally local to the element through `hx-*` attributes: what triggers a request, where it goes, what is selected, and how it is swapped.

Neither model is inherently more correct. They optimize for different application languages.

## Shared ground

Both approaches are comfortable with:

- server-rendered HTML as the application representation;
- HTML responses rather than JSON-to-client-template rendering;
- progressive enhancement;
- `fetch()`-based requests;
- partial page updates;
- browser history integration;
- native form validation;
- lifecycle hooks/events;
- response headers that can influence client behavior.

htmx 4 also moved its internals from `XMLHttpRequest` to `fetch()`, made attribute inheritance explicit by default, added built-in morphing swaps, and introduced `<hx-partial>` for multi-target responses.

## Different centers of gravity

| Concern | sco-pe | htmx 4 |
| --- | --- | --- |
| Main unit | A `<sco-pe>` navigation boundary | Any element carrying htmx behavior |
| Request declaration | Native links and forms | `hx-get`, `hx-post`, `hx-action`, `hx-method`, etc. |
| Trigger declaration | Mostly native click/submit semantics; scoped autosubmit is optional | Explicit and extensible through `hx-trigger` and natural defaults |
| Targeting | Current scope by default; `target`, `Scope-Target`, `scope-swap`; multi-target is a separate scoped concept | `hx-target`, swap modifiers, OOB updates, `<hx-partial>`, extensions |
| Swap policy | Deliberately narrow | Broad set of swap strategies, including built-in morphing |
| Behavior location | Scope attributes + server response headers | Primarily on the interacting HTML element |
| Descendant markup | Intentionally quiet, mostly native HTML | Intentionally expressive through `hx-*` attributes |
| Client scripting | External modules, custom elements, lifecycle listeners | Events, JavaScript API, extensions, `hx-live`, or other scripting libraries |
| Accessibility policy | Opinionated scope-level busy/focus/status/alert behavior | General mechanisms; application policy remains more configurable |
| History ownership | One navigation-owning scope per history entry | General htmx history model |
| Extensibility | Small public surface by design | Broad core + extension ecosystem |

The most important row is not the feature count. It is **behavior location**.

## Locality of behavior vs. locality of navigation

htmx deliberately embraces *Locality of Behavior*: the element involved in an interaction can describe the request, trigger, target and swap beside the markup it affects.

That is powerful when different controls on the same page need different interaction semantics.

`sco-pe` makes a different trade-off. It tries to keep most links and forms ignorant of the enhancement layer. The application says:

> Everything inside this boundary navigates like normal web content, but without leaving the page.

The interaction policy is therefore local to the **scope**, not necessarily to each trigger.

For an admin application with many conventional links, filters and CRUD forms, this can keep templates close to ordinary server-rendered HTML. For a UI where many elements need individually tuned request and swap behavior, htmx's model is naturally more expressive.

## Progressive enhancement

With `sco-pe`, the preferred production contract is that a link remains a link and a form remains a form.

```html
<sco-pe id="users" history="true">
  <form action="/users" method="get">
    <label>
      Search
      <input name="q">
    </label>
    <button>Search</button>
  </form>

  <div id="users-results">
    ...
  </div>
</sco-pe>
```

Without JavaScript, the browser submits `/users` normally.

With `sco-pe`, the same request carries:

```http
Scope-Request: true
```

The server may then return the representation appropriate to the enhanced request.

This distinction matters: if an endpoint returns a fragment for `Scope-Request` and a full document otherwise, the server should make that representation contract explicit and cache-safe, for example with an appropriate `Vary: Scope-Request` policy.

htmx can also be progressively enhanced. htmx 4's `hx-action` / `hx-method` model is explicitly designed to sit beside native `action` / `method`, and `hx-boost` can enhance ordinary links and forms. htmx also supports patterns that have no native equivalent, so the degree of graceful degradation depends on which htmx features an application chooses.

## Server authority

Both libraries work well when the server remains authoritative, but they express that authority differently.

`sco-pe` gives the server a small set of response controls:

```http
Scope-Status: User saved
Scope-Alert: Please fix the highlighted fields
Scope-Title: Users
Scope-Location: /users/12/edit
Scope-Redirect: /login
Scope-Target: sidebar
Scope-Script: /assets/user-form.js
Scope-Style: /assets/user-form.css
```

The client-side runtime stays relatively fixed. The controller can decide that a response needs a message, a different target, an asset, or a navigation change.

htmx has a larger request/response vocabulary and generally allows more of the interaction contract to be expressed directly in HTML. htmx 4 also supports status-specific swap configuration and `<hx-partial>` multi-target responses.

The distinction is not “server-driven vs client-driven.” Both are server-oriented. It is closer to:

- **sco-pe:** the server returns HTML into a small number of navigation conventions;
- **htmx:** HTML itself carries a richer hypermedia interaction language.

## Swapping and morphing

htmx 4 intentionally provides several swap strategies, including built-in `innerMorph` and `outerMorph`.

`sco-pe` intentionally does not expose a general-purpose morphing API. Its public model is:

- replace the scope;
- replace one `scope-swap` child;
- preserve narrowly selected expensive islands with `keep="same-html"`;
- route a response to another scope;
- potentially update several scopes through the separately specified multi-target format.

That narrower surface is useful only if it remains narrow. If application code starts asking for arbitrary per-element swap modes, insertion positions and trigger grammars, htmx's existing model is likely the more natural fit.

## Multi-target responses

htmx 4 introduced `<hx-partial>` for explicit multi-target responses:

```html
<hx-partial hx-target="#messages">
  ...
</hx-partial>

<hx-partial hx-target="#count">
  ...
</hx-partial>
```

`sco-pe` has a closely related multi-target design in `docs/multi-target.md`, but with different ownership rules: updates target named scopes, while the source scope continues to own the request and history entry.

The similarity is useful. It validates the underlying server-rendered pattern without requiring sco-pe to adopt the rest of htmx's element-level behavior language.

## Client-side behavior

htmx can be extended with events, extensions and scripting helpers. htmx 4 also ships a larger extension ecosystem and an optional `htmax.js` distribution.

`sco-pe` deliberately pushes richer behavior outside the navigation runtime:

- custom elements for reusable widgets;
- external ES modules;
- application event listeners;
- another behavior library when appropriate.

That separation is especially important for sco-pe: it should remain the navigation layer rather than grow into a general client-side behavior framework.

## When the models feel natural

`sco-pe` tends to feel natural when the application can mostly be described as:

> Render normal pages and forms on the server. Enhance a few stable regions so navigation and form submissions update in place.

htmx tends to feel natural when the application is better described as:

> Let individual HTML elements declare their own server interactions and compose richer request/target/swap behavior directly in markup.

A project can also start with one model and discover that its requirements fit the other better. The useful question is not which library has more features, but **which interaction language you want templates to speak**.

## References

- htmx 4 documentation: https://four.htmx.org/docs
- What's new in htmx 4: https://four.htmx.org/docs/whats-new-in-htmx-4
- htmx 4.0.0 release announcement: https://four.htmx.org/announcements/2026-08-28-htmx-4.0.0-is-released
- htmx `hx-target`: https://four.htmx.org/reference/attributes/hx-target
- htmx `hx-swap`: https://four.htmx.org/reference/attributes/hx-swap
