# sco-pe and Unpoly

This is not a feature contest. Both projects start from a similar premise:
server-rendered HTML should remain the primary application representation, while
navigation can be enhanced to avoid unnecessary full-page reloads.

The important difference is **how much of the application runtime the library
chooses to own**.

This document targets **Unpoly 3.14**.

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

The descendants are ordinary links and forms. The `<sco-pe>` boundary owns
fetching, swapping, history, focus, announcements and synchronization for that
region. Behavior outside the boundary belongs to the browser, another scope, a
custom element or application code.

Unpoly treats the current document more broadly as a collection of
**addressable fragments**. Links and forms may target arbitrary fragments by
CSS selector, several fragments may be updated by one render pass, persistent
layout fragments may opt into passive updates, and the runtime also offers
first-class layers, caching, component lifecycle hooks and other application
services.

A useful shorthand is:

> **Unpoly asks the runtime to understand more of the application. sco-pe asks
> the application to declare a few navigation boundaries.**

Both approaches are coherent. They optimize for different ownership models.

## Shared ground

Both projects are comfortable with:

- server-rendered HTML rather than JSON-to-client-template rendering;
- progressive enhancement of ordinary links and forms;
- partial page updates;
- browser history integration;
- server responses that influence client rendering;
- focus, scroll and loading-state concerns;
- preserving selected client-side state across renders;
- concurrent requests whose responses may arrive out of order;
- direct visits and full-page reloads remaining meaningful.

The overlap is significant enough that Unpoly is a useful source of edge cases
for sco-pe. The implementation choices should not automatically be copied,
because the two projects deliberately draw their boundaries in different
places.

## Different centers of gravity

| Concern | sco-pe | Unpoly 3.14 |
| --- | --- | --- |
| Main unit | A `<sco-pe>` navigation boundary | An addressable fragment in the current layer |
| Link/form behavior | Native by default inside a scope | Explicit enhancement, or configurable global interception |
| Target identity | Scope id; `scope-swap` is local to that scope | CSS selector, with derivation and region-aware matching |
| Multi-target | Separate scoped response concept | Multiple target selectors in one render pass |
| Optional target | `optional` partial, designed with multi-target | `:maybe` |
| Passive surrounding updates | `Scope-Event` + application reaction | `[up-hungry]` |
| Request context | `Scope-Request`, `Scope-Source`, `Scope-Target` | Rich `X-Up-*` protocol including target information |
| Concurrency | Per-scope request and operation ownership | Target-aware request abort rules |
| Preserved client state | Narrow `keep="same-html"` islands | General `[up-keep]` mechanism |
| Dialogs / overlays | External/native concern | First-class layer system |
| JavaScript lifecycle | Custom elements / external modules | `up.compiler()` lifecycle |
| Caching | Browser/server responsibility; explicit `revalidate()` only | Built-in cache, expiry and revalidation |
| Extensibility goal | Small public surface | Broad application runtime |

The most important difference is not feature count. It is **ownership**.

## Local navigation boundary vs. global fragment runtime

`sco-pe` begins with an explicit boundary:

```html
<sco-pe id="users">
  ...
</sco-pe>
```

Links and forms inside that element navigate the scope. Content outside it is
not implicitly part of the operation.

That boundary is also the unit for request cancellation, busy state, focus,
scrolling, announcements and history ownership.

Unpoly can work locally too, but it is designed to reason about fragments across
the current layer. A target is normally a CSS selector:

```html
<a href="/posts/5" up-target=".content">
  Read post
</a>
```

The runtime matches `.content` in both the current document and the server
response. It also supports region-aware matching for ambiguous selectors,
special selectors such as `:main`, `:layer`, `:origin`, `:before`, `:after`,
`:content` and `:none`, and selector derivation from DOM elements.

That expressiveness is valuable when arbitrary page regions need independent
interaction semantics. It also means the rendering engine must understand more
about the surrounding DOM.

`sco-pe` deliberately keeps target identity smaller:

```text
Scope-Target           = scope id
scope-partial target   = scope id
scope-swap             = selector local to that scope
```

There is no target derivation and no proximity-based resolution. A missing
scope id is an explicit contract failure rather than a request for the runtime
to find the most plausible region.

## Progressive enhancement and global interception

Unpoly may be configured to handle all links and forms on the page. This gives
an application very smooth navigation with little repeated markup, while the
runtime applies documented exceptions for downloads, cross-origin links,
explicit targets and other cases.

`sco-pe` takes the opposite default: interception is opt-in by structural
containment.

```html
<header>
  <!-- normal browser navigation -->
</header>

<sco-pe id="main">
  <!-- enhanced navigation -->
</sco-pe>
```

This makes the enhancement boundary visible in the document and keeps legacy or
unrelated page behavior outside the runtime unless it is deliberately placed in
a scope.

Neither approach is inherently more progressive. The difference is whether
enhancement policy is primarily **global with exceptions** or **local with
explicit boundaries**.

## Multi-target updates

Unpoly can update several fragments from one request by targeting several CSS
selectors:

```html
<a href="/posts/5" up-target=".content, .unread-count">
  Read post
</a>
```

Required targets must match in both the current document and the server
response. Missing required targets fail the render. A target can explicitly be
made optional with `:maybe`.

This is directly relevant to sco-pe's planned multi-target response:

```html
<scope-partial target="main">
  ...
</scope-partial>

<scope-partial target="stats">
  ...
</scope-partial>
```

The important lesson is not the selector syntax. It is the contract:

1. **Required targets should fail closed.**
2. **Optional targets are a legitimate use case, but optionality should be
   explicit.**
3. **The complete structural response should be validated before the first DOM
   mutation.**

For sco-pe, an eventual optional form should remain identity-based rather than
introducing a selector language, for example:

```html
<scope-partial target="stats" optional>
  ...
</scope-partial>
```

The multi-target design includes it with a narrow rule: an optional partial is
skipped only when its scope is absent from the document; every other failure
stays fail-closed.

There is also an important boundary rule:

> **If several regions normally change together, prefer one larger `<sco-pe>`.
> Multi-target is for independent scopes that occasionally need to change as
> part of the same server response.**

This avoids decomposing ordinary page navigation into a network of synchronized
fragments.

## Primary and secondary regions

A multi-fragment render eventually needs to distinguish the main navigation
destination from secondary updates.

Unpoly exposes this distinction in parts of its rendering API. For example,
some render data applies only to the primary fragment unless a per-target map
is supplied.

For sco-pe the primary region usually does not need to be declared by the
server. The client already knows the intended navigation target:

```html
<sco-pe id="sidebar" target="main">
  ...
</sco-pe>
```

Conceptually:

```text
source             = sidebar
navigation target  = main
affected targets   = main, breadcrumbs, stats
primary target     = the partial targeting "main", if present
```

The source owns the request and history entry. The primary target owns
navigation UX such as focus and scroll. Secondary targets receive DOM updates
without becoming independent navigations.

If no partial targets the navigation destination, the response may have no
primary swap at all.

## Passive updates: `[up-hungry]` vs. `Scope-Event`

Unpoly has a particularly powerful mechanism called `[up-hungry]`.

A hungry fragment is updated whenever a matching fragment appears in a server
response, even if that fragment was not explicitly targeted. Typical examples
include unread counters, subnavigation and account-wide notifications.

This solves a real problem: persistent layout fragments often need to stay in
sync with navigation elsewhere.

It also expands the runtime's responsibilities. Unpoly must derive a target for
each hungry element, merge it into render targeting, handle optional matches,
resolve conflicts between direct and hungry targets, deal with nested hungry
fragments and account for layers.

`sco-pe` should not copy this mechanism.

Its existing split is smaller:

```text
<scope-partial>
    "The server already has the new HTML for this target."

Scope-Event
    "A domain fact happened; interested clients may react."
```

For example:

```http
Scope-Event: notifications.changed
```

A notification widget that exists may revalidate itself. If it does not exist,
nothing special is required.

This may occasionally cost an additional request, but it keeps synchronization
ownership explicit and avoids making every render implicitly inspect the whole
document for passive dependants.

## Request context and optimized responses

Unpoly sends the effective target selector to the server in the
`X-Up-Target` request header. The server can use that information to avoid
rendering expensive regions that are not needed.

If the response representation depends on that header, Unpoly documents that
the server should include it in `Vary`.

sco-pe adopted the same pattern, independently of multi-target rendering. A
sco-pe request sends:

```http
Scope-Request: true
Scope-Source: sidebar
Scope-Target: main
```

That tells the server:

```text
which scope originated the navigation
where that navigation is intended to land
```

The server can then choose an optimized response without guessing the current
layout. Like Unpoly, the request header shares its name with the response
header that routes a response (`Scope-Target`).

If those headers affect representation, the HTTP cache contract must reflect
that, for example:

```http
Vary: Scope-Request, Scope-Source, Scope-Target
```

This should be treated as an HTTP representation concern, not as permission to
grow a large client/server protocol.

## Render lifecycle: prepare, commit, settle

Unpoly exposes a mature rendering lifecycle. Notably, its
`up:fragment:loaded` event runs after new HTML has been loaded but before
elements are changed, and preventing that event aborts the render without
changing fragments, focus or scroll.

That validates a useful internal direction for sco-pe:

```text
FETCH

  ↓

PREPARE (async)
- parse response
- resolve targets
- validate target contracts
- build fragments
- resolve URLs
- load required components
- check operation ownership
- dispatch before-swap vetoes

  ↓
  no asynchronous gap

COMMIT (sync)
- mutate target DOM

  ↓

SETTLE
- focus
- scroll
- announcements
- events
- lifecycle completion
```

This decomposition is useful even without multi-target support. The current
single-target and `Scope-Target` paths can use the same pipeline.

For multi-target responses it gives a stronger guarantee: malformed responses
can fail during preparation before any target is modified.

It is not a true DOM transaction. Event listeners may have side effects and a
runtime exception during commit cannot magically roll back arbitrary DOM
changes. The goal is narrower: **perform every operation that may reasonably
fail before the first mutation, then keep the commit path synchronous and
small**.

## Concurrency

Unpoly's render concurrency is target-aware. By default, a new render aborts
unfinished requests targeting the fragment being updated or its descendants.
Independent targets may continue.

This addresses an important class of stale-response bugs without globally
serializing every network operation.

`sco-pe` can solve the same class of problem with a much smaller identity
model. Every scope already owns an operation token, so conflict detection can
be based on stable scope ids rather than arbitrary DOM ancestry.

For a coordinated response affecting several scopes, a useful rule is:

```text
navigation / primary target superseded
    → discard the coordinated navigation

secondary target superseded
    → do not overwrite that secondary target
```

This preserves the user's newer navigation intent while allowing independent
secondary regions to protect their own newer state.

The `_self` case requires special care: the source scope must reuse the
operation token of the request currently producing the response. Claiming a new
operation on the source would abort its own request.

## Preserving client-side state

Unpoly's `[up-keep]` mechanism can preserve elements while surrounding
fragments are rendered. It supports multiple policies such as preserving until
identity can no longer be correlated, `same-html` and `same-data`.

This solves many practical cases, including media playback.

`sco-pe` intentionally has a narrower mechanism:

```html
<sco-pe keep="same-html"
        keep-selector="admin-rich-select, admin-map">
```

Its purpose is not general DOM reconciliation. It preserves narrowly selected,
keyed islands when their server-rendered representation has not changed.

This narrower contract fits well with custom elements: the application can
preserve the identity of an expensive platform-owned widget without requiring
the navigation runtime to become a general client-state reconciliation engine.

Unpoly remains useful here as an edge-case catalogue, especially around
reordering, media state and lifecycle cleanup.

## Layers and overlays

Unpoly has a first-class layer model. The initial page is the root layer, and
additional pages may be stacked as modal, drawer, popup or cover overlays.
Layers participate in targeting, history, focus and navigation.

This is a coherent choice for a runtime that wants to own application
navigation globally.

`sco-pe` should keep overlays outside its domain.

A native `<dialog>`, an Actual CSS dialog or another overlay component owns
dialog semantics. A nested `<sco-pe>` may own server navigation for the content
inside it.

Conceptually:

```text
dialog component
    owns modality, opening, closing and visual behavior

sco-pe
    owns server navigation inside the region
```

This avoids requiring the navigation runtime to understand whether a scope is
inside a modal, drawer or other presentation mode.

## JavaScript lifecycle

Unpoly's `up.compiler()` registers behavior for matching elements inserted by
render passes. Compilers support destructor functions, ordering, batching and
asynchronous initialization.

That lifecycle is valuable when the rendering framework also owns the component
enhancement layer.

`sco-pe` deliberately leaves that job to the platform and application modules:

```text
navigation lifecycle   → sco-pe
component lifecycle    → custom elements
application behavior   → external ES modules / event listeners
```

Custom elements already have `connectedCallback()` and
`disconnectedCallback()`. `Scope-Script` and the component registry handle
loading when server-rendered content requires additional modules.

Adding a general compiler system would duplicate a responsibility that
sco-pe's architecture intentionally leaves elsewhere.

## Caching and revalidation

Unpoly includes an application-level response cache. Navigation may render
cached content immediately and then revalidate it against the server. It also
has expiration, eviction, cache invalidation after mutations and conditional
revalidation behavior.

This is a good example of a feature whose edge cases naturally expand once the
runtime accepts ownership.

`sco-pe` should not own an application response cache.

Its smaller contract is:

```text
browser / HTTP cache    supported
304                     supported
scope.revalidate()      supported
Service Worker          application choice
application cache       outside sco-pe
```

The runtime should remain compatible with standard HTTP caching rather than
becoming a second cache-coherence layer.

## Failed responses

Unpoly supports separate rendering options for failed responses, including a
separate failure target.

The underlying problem is real: a successful form submission may navigate a
main region while a validation error should stay close to the form.

`sco-pe` already has a smaller server-driven answer:

- HTML `422` responses are renderable;
- `Scope-Target` can route a response when necessary;
- the server chooses the appropriate representation for the outcome.

A separate `fail-target` concept is therefore not currently needed.

## What sco-pe should learn from Unpoly

Unpoly has accumulated solutions for many problems that appear only after a
partial-navigation engine is used in large applications. It is useful as a
design checklist.

For sco-pe, the strongest lessons are:

1. Validate required multi-target responses before mutating the DOM.
2. Treat optional targets as an explicit concept rather than silently ignoring
   missing required targets.
3. Send enough request context for the server to optimize a partial response
   without guessing.
4. Keep cache partitioning and `Vary` correct when request headers affect
   representation.
5. Separate asynchronous preparation from synchronous DOM commit.
6. Make concurrency target-aware so stale responses cannot overwrite newer user
   intent.
7. Distinguish one navigation destination from secondary synchronized regions.
8. Preserve expensive islands narrowly rather than morphing arbitrary client
   state by default.

Equally important are the responsibilities sco-pe should **not** absorb merely
because Unpoly demonstrates that they can be solved:

- global target derivation;
- proximity-based selector matching;
- implicit hungry-fragment discovery;
- a layer / overlay runtime;
- an application response cache;
- a general JavaScript compiler lifecycle;
- a large selector pseudo-language;
- arbitrary per-element render strategies.

Those features are not mistakes in Unpoly. They are consequences of a broader
and internally consistent ownership model.

The constraint for sco-pe is different: **learn from the edge cases without
adopting the global runtime that made those edge cases its responsibility**.

## When the models feel natural

`sco-pe` tends to feel natural when the application can mostly be described as:

> Render normal pages and forms on the server. Enhance a few explicit regions
> so navigation and form submissions update in place. Let the browser and
> dedicated components own everything else.

Unpoly tends to feel natural when the application is better described as:

> Treat the current server-rendered document as a set of coordinated fragments,
> and let one frontend runtime manage navigation, targeting, layers, caching,
> component enhancement and related lifecycle concerns.

A sufficiently sophisticated server-rendered application may benefit from
either model. The important question is not which runtime can solve more
problems, but **which problems the navigation layer should own**.

## References

- Unpoly 3.14 documentation: https://unpoly.com/
- Targeting fragments: https://unpoly.com/targeting-fragments
- Handling all links and forms: https://unpoly.com/handling-everything
- `[up-hungry]`: https://unpoly.com/up-hungry
- `[up-keep]`: https://unpoly.com/up-keep
- `up.render()`: https://unpoly.com/up.render
- Render lifecycle: https://unpoly.com/render-lifecycle
- `X-Up-Target`: https://unpoly.com/X-Up-Target
- Layer terminology: https://unpoly.com/layer-terminology
- `up.compiler()`: https://unpoly.com/up.compiler
- Caching: https://unpoly.com/caching
