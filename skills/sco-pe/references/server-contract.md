# Server contract

Always verify the installed `docs/server-contract.md`; this reference explains the decision model.

## Request negotiation

A sco-pe request identifies itself:

```http
Scope-Request: true
Accept: text/html, application/xhtml+xml;q=0.9
```

Current versions also expose navigation ownership:

```http
Scope-Source: sidebar
Scope-Target: main
```

Use source/target information to optimize rendering, not to create a second application model.

The server already knows the URL, method, query string, form body and session state. Do not duplicate them into custom scope headers.

## Dual representation

Preferred contract:

```text
normal browser request -> complete usable HTML document
sco-pe request         -> HTML suitable for the receiving scope
```

Both must express the same logical result. The fragment is a transport optimization.

A route that only works when `Scope-Request` is present has lost progressive enhancement.

## Caching

If the response representation changes according to request headers, shared caches must know.

Typical cases:

```http
Vary: Scope-Request
```

or:

```http
Vary: Scope-Request, Scope-Target
```

Add `Scope-Source` only when it actually changes representation.

Do not mechanically add every header to `Vary`; partition the cache only on inputs that matter. An application may choose uncacheable responses instead.

## Response headers

Use the installed version's documented `Scope-*` vocabulary. Common responsibilities include:

```text
Scope-Status    polite status announcement
Scope-Alert     important/error announcement
Scope-Title     document title
Scope-Location  scoped follow-up navigation
Scope-Redirect  full browser redirect
Scope-Reload    full page reload
Scope-Script    external ES module dependency
Scope-Style     external stylesheet dependency
Scope-Select    response extraction
Scope-Target    route response to another scope
Scope-Event     domain signal names
```

Do not invent new headers when ordinary HTTP semantics or application code already solve the requirement.

## Location vs redirect

```text
Scope-Location
    load another URL inside the navigation context

Scope-Redirect
    perform a full browser navigation
```

Authentication/session boundaries are common reasons to prefer a full redirect.

## Validation

Return validation failures as HTML:

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: text/html
Scope-Alert: Please fix the highlighted fields
```

A rendered 422 is not HTTP success, but it may be successful rendering:

```js
{ ok: false, rendered: true }
```

Do not make client code assume `ok === rendered`.

## No-content statuses

Current contract:

```text
204  no swap
205  no swap, reset: true signal
304  unchanged success, no swap
```

sco-pe does not automatically reset application state for `205`.

## Server errors

HTML error responses, including 5xx, are renderable by default so the server can provide useful recovery UI.

If a product must keep existing content for a class of errors, veto in `scope:before-swap`; do not globally assume "non-2xx means never render".

## CSRF

Use the application's normal form CSRF mechanism.

Because sco-pe submits native forms with their native encoding and fields, there should not be a second AJAX-only token convention.

## Test both representations

For representative routes, test:

1. direct/full browser request;
2. sco-pe request;
3. validation/error response;
4. cache headers when representation varies.

The same endpoint should remain meaningful in both direct and enhanced navigation.
