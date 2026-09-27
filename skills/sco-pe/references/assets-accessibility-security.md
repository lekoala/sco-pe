# Assets, accessibility and security

## Asset ownership

Fetched HTML is not an executable bundle.

sco-pe removes fetched:

```text
<script>
<style>
<link rel="stylesheet">
```

Use documented external mechanisms instead:

```text
Scope-Script
Scope-Style
component registry
```

Prefer root-absolute asset paths unless the installed docs say otherwise.

Modules should be idempotent.

## Custom elements

Reusable product behavior belongs naturally in custom elements.

sco-pe may load a registered module when fetched HTML contains an undefined registered component, then wait for that component to be defined.

Do not turn the navigation runtime into a generic component compiler when `connectedCallback()` / `disconnectedCallback()` already provide lifecycle.

## Dialogs and overlays

Keep one owner per responsibility:

```text
native/Actual/other dialog
  -> modality, opening/closing, presentation

sco-pe
  -> server navigation for content inside the dialog
```

Do not add overlay concepts to sco-pe merely because navigation can occur inside an overlay.

## Busy state

A loading scope should expose accurate `aria-busy`.

Avoid application code that manually toggles competing busy state on the same scope.

For long-running non-navigation tasks, use an application-level indicator rather than pretending a scope request is active.

## Focus

After a navigation, focus should move only when doing so helps the user understand the new state.

Use the installed focus policies rather than reproducing them with ad-hoc event listeners.

For secondary/background updates:

- avoid stealing focus;
- preserve a surviving focused element;
- do not dump focus back to `<body>` when removed content contained focus.

## Status and alert announcements

A typical layout provides persistent live regions:

```html
<div id="scope-status"
     role="status"
     aria-live="polite"
     aria-atomic="true"></div>

<div id="scope-alert"
     role="alert"
     aria-atomic="true"></div>
```

Use status for normal completion and alert for important/error feedback.

Do not duplicate the same message through several independently updating scopes.

## Validation accessibility

A 422 response should render meaningful server validation UI:

```html
<div id="form-errors" role="alert" tabindex="-1">
  Please fix the highlighted fields.
</div>

<label for="email">Email</label>
<input
  id="email"
  name="email"
  aria-invalid="true"
  aria-describedby="email-error"
>
<p id="email-error">Email is required.</p>
```

The server remains authoritative for domain validation.

## Trust model

sco-pe renders trusted same-origin application HTML.

It is **not** a sanitizer.

Stripping script/style elements does not make arbitrary HTML safe. The application still owns:

- output encoding;
- URL safety;
- inline event attributes;
- `javascript:` URLs;
- CSP;
- authorization of returned content.

Use a strict CSP without inline scripts where possible.

## External assets

External script/style loading is a separate trust boundary and is refused by default in current sco-pe versions unless explicitly enabled.

Before relaxing that policy, identify:

- exact allowed origin;
- CSP impact;
- supply-chain ownership;
- whether a same-origin bundled module would be simpler.

## Trusted Types

Do not assume Trusted Types support unless the installed version documents it.

If the application requires `require-trusted-types-for 'script'`, verify the current parsing seam before enabling the policy.
