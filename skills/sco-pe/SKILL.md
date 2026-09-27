---
name: sco-pe
description: Build and review server-rendered partial navigation with @lekoala/sco-pe. Use when defining <sco-pe> boundaries, server response contracts, scoped links/forms, history/focus/scroll/sync policy, scope-swap, Scope-Target, Scope-Event, assets, accessibility, concurrency, or when deciding whether behavior belongs in sco-pe or application code.
---

# sco-pe

Use sco-pe as a **navigation boundary**, not as a small SPA framework.

The target is:

> native links and forms remain authoritative, the server owns HTML, a scope owns its navigation lifecycle, and unrelated application behavior stays outside the navigation runtime.

## Start from the installed API

Resolve uncertain behavior from the version used by the current project, in this order:

1. `@lekoala/sco-pe/package.json` — installed version and public exports.
2. `@lekoala/sco-pe/README.md` — public attributes, headers, lifecycle and examples.
3. `@lekoala/sco-pe/docs/server-contract.md` — request negotiation, response semantics, caching, CSRF and concurrency.
4. `@lekoala/sco-pe/src/Scope.js` and `src/config.js` — exact runtime behavior and defaults.
5. `@lekoala/sco-pe/docs/upgrade-notes.md` — behavior changes between versions.
6. Design documents such as `docs/multi-target.md` — **design only unless the installed runtime implements them**.

If this skill was copied into a consuming project, the installed package wins over examples or summaries in this skill.

Use the bundled inspector when useful:

```sh
node <skill>/scripts/inspect-sco-pe.mjs --source
node <skill>/scripts/inspect-sco-pe.mjs --exports
node <skill>/scripts/inspect-sco-pe.mjs --headers
node <skill>/scripts/inspect-sco-pe.mjs --defaults
node <skill>/scripts/inspect-sco-pe.mjs --docs
```

Set `SCO_PE_ROOT=/path/to/sco-pe` to inspect a specific checkout/package.

If `PROJECT.md` exists beside this file, read it after resolving the installed sco-pe API. It contains application-specific navigation choices, not framework API.

## Decision order

Before adding a new navigation mechanism, ask in this order:

1. **Native navigation** — is a normal link or form submit already the clearest behavior?
2. **Whole scope** — do the regions that normally change together belong in one `<sco-pe>`?
3. **`scope-swap`** — is one child inside that scope the only thing that should be replaced?
4. **`Scope-Event` + `revalidate()`** — did a domain fact change and can an interested secondary region refresh itself?
5. **`Scope-Target`** — does this whole response belong to another existing scope?
6. **Multi-target** — only when the installed runtime implements it and one response genuinely needs to update several independent scopes.
7. **Application behavior** — if the requirement is not navigation, keep it in a custom element, application module, native platform primitive, or another dedicated library.

Prefer the lowest mechanism that preserves a clear mental model.

Do not decompose a normal page into many scopes merely to make updates more surgical.

## Core model

A scope is a **navigation context**:

```html
<sco-pe id="main" history="true">
  <a href="/users?page=2">Next</a>

  <form action="/users" method="post">
    ...
  </form>
</sco-pe>
```

Rules:

- Links stay links and forms stay forms.
- Native `href`, `action`, `method`, `formaction`, `formmethod`, validation and CSRF conventions remain the baseline.
- Behavior policy belongs on `<sco-pe>` or in server `Scope-*` response headers.
- Do not invent a public `data-scope-*` language.
- `data-confirm` is the deliberate leaf-level exception for confirmation.
- Do not turn sco-pe into a client-side router, store, component lifecycle system, overlay manager or application cache.

See `references/mental-model.md`.

## Scope boundaries

Choose boundaries from **navigation cohesion**, not DOM size.

Put regions in the same scope when they normally describe the same navigation state:

```text
breadcrumbs + page title + tabs + main content
    -> usually one navigation scope
```

Keep regions independent when they have their own lifecycle:

```text
main content
notification counter
persistent server dialog host
independent dashboard widget
    -> separate scopes may be appropriate
```

A stale sidebar or breadcrumb is often a boundary problem before it is a multi-target problem.

History should normally belong to the scope that represents the page's primary navigation.

## Server contract

A normal request must remain a valid browser navigation. A sco-pe request may return a smaller representation as a transport optimization:

```text
normal request        -> full HTML document
Scope-Request: true   -> scoped HTML representation
```

Current sco-pe requests also identify navigation ownership:

```http
Scope-Request: true
Scope-Source: sidebar
Scope-Target: main
```

Treat `Scope-Source` / `Scope-Target` as optimization context, not a second application protocol.

If response representation depends on request headers, keep HTTP caching correct with `Vary` or make the response uncacheable.

Do not return JSON for the client to template when server-rendered HTML already represents the state.

See `references/server-contract.md`.

## Forms and HTTP outcomes

Use ordinary form semantics.

- Keep the application's existing CSRF convention.
- Let native form validity run unless intentionally disabled.
- Return `422` with renderable HTML for validation failures.
- A rendered `422` may correctly report `{ ok: false, rendered: true }`.
- `204` and `304` complete without swapping.
- `205` is a no-swap lifecycle signal with `reset: true`; application code owns any actual reset.
- HTML 5xx responses are renderable by default so the server can provide recovery UI.

Do not treat HTTP success and successful DOM rendering as the same concept.

## Targeting and refresh

Keep the targeting vocabulary small:

```text
target attribute   -> route navigation from one scope to another
Scope-Target       -> server routes the whole response to another scope
scope-swap         -> replace one child inside the receiving scope
Scope-Event        -> announce a domain fact; consumers decide whether to react
revalidate()       -> explicitly refresh a scope
```

`scope-swap` is local to its receiving scope and fails closed. It is not arbitrary document-wide targeting.

Keep `Scope-Event` as signal names, not payload transport or executable commands.

See `references/targeting-and-refresh.md`.

## Concurrency and ownership

The default `sync="auto"` policy is intentionally asymmetric:

```text
GET / HEAD      -> replace stale in-flight reads
unsafe methods  -> drop a second mutation while one is in flight
```

A canceled fetch does not undo a server mutation that may already have been received.

Do not casually switch POST-like flows to `sync="replace"`.

For routed responses, distinguish:

```text
source scope -> owns request, cancellation and history
target scope -> owns swap, focus and announcement
```

Newer user intent on a target must win over an older routed response.

When working on swap internals or future multi-target support, prefer a prepare / commit / settle pipeline: perform fallible asynchronous work before DOM mutation, keep the commit synchronous, then settle focus/scroll/events.

See `references/lifecycle-and-concurrency.md`.

## Assets and application behavior

Fetched HTML is content, not an inline script transport.

- Fetched `<script>`, `<style>` and stylesheet `<link>` elements are removed.
- Use `Scope-Script` / `Scope-Style` for response-discovered external dependencies.
- Use the component registry for known custom-element module mappings.
- Keep application behavior in custom elements or external modules.
- Modules must be idempotent.
- Do not add a general compiler/controller lifecycle to sco-pe when the platform or application already owns it.

For dialogs and overlays, let the dialog/overlay component own modality, opening, closing and presentation. Let sco-pe own server navigation inside the relevant content region.

## Accessibility

Accessibility is part of the navigation contract.

- Keep `aria-busy` accurate while loading.
- Provide persistent status and alert live regions when the application uses announcements.
- Preserve meaningful focus after swaps.
- Use `focus="none"` only for intentionally silent/background updates.
- Keep same-document hash navigation native.
- Validation responses should connect summaries/errors with fields and expose invalid state.
- A secondary refresh should not steal focus from the user's primary task.

See `references/assets-accessibility-security.md`.

## Security

sco-pe renders **trusted same-origin application HTML**.

It is not an HTML sanitizer and not an XSS boundary.

- Keep strict server-side output encoding.
- Prefer a strict CSP without inline scripts.
- Do not assume stripped `<script>` tags make arbitrary fetched HTML safe.
- External assets are a separate trust decision.
- Respect the installed package's current external-asset and Trusted Types behavior.

See `references/assets-accessibility-security.md`.

## Project customization

This starter describes **sco-pe itself**. A consuming application should put stable local choices in `PROJECT.md`, not rewrite framework facts.

Useful project-specific additions include:

- the map of scopes and their responsibilities;
- which scope owns browser history;
- which routes return full vs scoped representations;
- cache / `Vary` policy;
- status and alert regions;
- domain `Scope-Event` names;
- custom-element registry entries;
- dialog/overlay integration;
- stricter browser or CSP requirements;
- server helper conventions.

Start from `PROJECT.md.example`.

Project rules may narrow how sco-pe is used, but must not invent public sco-pe API.

## Task index

- boundaries, native-first rules, ownership -> `references/mental-model.md`
- request/response headers, HTTP statuses, caching, CSRF -> `references/server-contract.md`
- `scope-swap`, `Scope-Target`, `Scope-Event`, refresh -> `references/targeting-and-refresh.md`
- history, lifecycle, races, sync policy -> `references/lifecycle-and-concurrency.md`
- assets, dialogs, accessibility, security -> `references/assets-accessibility-security.md`
- final integration review -> `references/review-checklist.md`

## Completion check

Before considering a sco-pe integration complete:

- Native links/forms still work without sco-pe interception.
- Scope boundaries follow navigation cohesion rather than arbitrary DOM slicing.
- No invented `data-scope-*`, response header, event, attribute or package export was added.
- The installed package version, not a design document, was used as API truth.
- Full-page and scoped representations preserve the same logical content.
- `Vary` / cache policy matches every request header that changes representation.
- Validation, no-content and error statuses have intentional behavior.
- `scope-swap` targets are local and fail closed.
- Unsafe mutations do not use cancellation semantics that imply rollback.
- Routed responses preserve source/target ownership and newer user intent.
- Focus, scroll, busy state and announcements remain coherent.
- Fetched HTML does not smuggle inline application behavior.
- Product behavior that is not navigation remains outside sco-pe.
