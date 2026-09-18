# sco-pe server contract

This is the complete contract between a sco-pe scope and an HTTP endpoint. The
goal is dual representation: the same URL serves a full document to a normal
browser navigation and a scoped representation to a sco-pe request.

## Request negotiation

A sco-pe fetch sends:

```http
Scope-Request: true
Accept: text/html, application/xhtml+xml;q=0.9
```

That is the whole built-in request contract. The server already knows the URL,
the method, the query string and the form body. No scope id is sent: which DOM
element initiated the request is client composition detail, and branching
server output on it would couple controllers to page layout. Applications with
a genuine need can add their own header through `requestHeaders`.

```js
Scope.configure({ requestHeaders: { "X-App-Section": "admin" } });
```

## Full document vs scoped response

```txt
normal request        -> full HTML document, usable without JavaScript
Scope-Request: true   -> scoped representation for the requesting scope
```

Both representations must carry the same logical content. The fragment is a
transport optimization, not a second application. A functional test should call
the same endpoint both ways and assert that both responses are usable. The
representative fixture is `/admin-flow/users` in `tests/fixtures/server.mjs`
with its Playwright coverage in `tests/scope.spec.js`.

## Response headers

```http
Scope-Status: User saved
Scope-Alert: Please fix the highlighted fields
Scope-Title: Users
Scope-Location: /admin/users/12
Scope-Redirect: /login
Scope-Reload: true
Scope-Script: /assets/admin/user-form.js
Scope-Style: /assets/admin/user-form.css
Scope-Select: #main-content
Scope-Target: sidebar
```

- `Scope-Status` / `Scope-Alert` mirror into the persistent `#scope-status` /
  `#scope-alert` live regions and emit `scope:status` / `scope:alert`.
- `Scope-Title` sets `document.title`.
- `Scope-Redirect` performs a full browser navigation. `Scope-Reload`
  reloads the page.
- `Scope-Location` loads the given URL into the current scope (scoped
  redirect, e.g. POST-redirect-GET inside the region).
- `Scope-Script` / `Scope-Style` load external ES modules and stylesheets.
  Inline `<script>`, `<style>` and stylesheet `<link>` in fetched HTML are
  removed by design.
- `Scope-Select` extracts the matched element's content from a full-document
  response.
- `Scope-Target` routes the whole body to another scope. The source keeps
  owning the request, cancellation and history entry; the target owns the
  swap, focus and announcement. Both scopes emit `scope:load` with `source`
  and `target` in the detail.

## Validation with 422

Return `422` with HTML that describes the failure (for example a `role="alert"`
summary and `aria-invalid` fields). sco-pe swaps it like any rendered response
and reports `{ ok: false, rendered: true }` so the application can distinguish
transport success from rendering.

## 204 / 205 / 304

- `204 No Content` and `304 Not Modified`: no swap, lifecycle completes
  without rendering.
- `205 Reset Content`: no swap either. The lifecycle completes with
  `reset: true` as a signal only. sco-pe does not reset forms automatically;
  application code decides what "reset" means for its own state.

## Caching

Send `Vary: Scope-Request` only when the same URL genuinely produces two
different representations depending on that header. Without it, a shared HTTP
cache may serve a fragment to a full navigation or the reverse.

## CSRF

Use the exact same CSRF convention as normal framework forms. sco-pe submits
native forms with their native encoding and fields, so no parallel token
mechanism is needed.

## scope-swap contract

When a scope declares `scope-swap="#results"`, every response to that scope
must contain exactly one root element: the replacement for `#results`. The
swap fails closed:

- missing local target → explicit error, no swap;
- zero or multiple response roots → explicit error, no swap;
- never a silent fallback to a full-scope swap.

A failure throws inside `processParsedResponse`, so `loadURL` completes with
`{ ok: false, rendered: false }`, emits `scope:error` and releases the busy
state. When `Scope-Target` routes to a scope whose `scope-swap` is invalid,
the target emits `scope:error` for its failed swap and the source request
completes as failed.

A `scope-swap` response deliberately does not have to match the selector
itself. If the replacement drops the `#results` id, the next navigation fails
explicitly, which is sufficient.

Focus is preserved surgically: when the focused element lives in the scope but
outside the swapped child, the swap leaves focus alone and the scope focus
policy is skipped. Only a focus target removed by the swap falls back to the
normal `focus` policy.

## Concurrency contract

The default is `sync="auto"`: safe methods (`GET`, `HEAD`) replace the
in-flight request, unsafe methods are dropped while one is in flight and the
dropped navigation emits `scope:sync-dropped`. A mutation already sent is never
"cancelled" by another one. Explicit `sync="replace|queue|drop"` per scope
remains available; `queue` keeps at most one pending intent and the newest
waiting navigation wins (latest-pending, not a FIFO).

## PSR-7 example

Deliberately plain, no sco-pe PHP package. Any PSR-7 / PSR-15 stack works the
same way:

```php
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

function isScopeRequest(ServerRequestInterface $request): bool
{
    return $request->getHeaderLine('Scope-Request') === 'true';
}

function scoped(ResponseInterface $response, string $html, array $scopeHeaders = []): ResponseInterface
{
    $response->getBody()->write($html);
    // Only when this URL really varies on the header.
    $response = $response->withAddedHeader('Vary', 'Scope-Request');
    foreach ($scopeHeaders as $name => $value) {
        $response = $response->withHeader($name, $value);
    }
    return $response->withHeader('Content-Type', 'text/html; charset=utf-8');
}

// In a controller or middleware:
if (!isScopeRequest($request)) {
    return $fullPage($request); // complete document, no JS required
}

if ($email === '') {
    return scoped($response->withStatus(422), $formFragment, [
        'Scope-Alert' => 'Please fix the highlighted fields.',
    ]);
}

return scoped($response, $sidebarFragment, [
    'Scope-Target' => 'sidebar',
    'Scope-Status' => 'User created',
]);
```
