# Consumer review checklist

## Boundaries

- Each `<sco-pe>` represents a meaningful navigation context.
- Breadcrumbs/tabs/title/content that normally change together were not split unnecessarily.
- Secondary widgets are separate only when they have a genuinely independent lifecycle.
- Native full-page navigation still works.

## HTML and forms

- Links use `href`; forms use native `action` / `method`.
- Submitter overrides use `formaction` / `formmethod`.
- Native validity is not bypassed accidentally.
- CSRF follows the application's normal server convention.
- No invented `data-scope-*` API is present.
- `data-confirm` is used only for action confirmation.

## Server contract

- Full and scoped representations express the same logical result.
- `Scope-Request`, `Scope-Source` and `Scope-Target` are interpreted according to the installed version.
- `Vary` or cacheability matches every header that changes representation.
- Response `Content-Type` is intentional and renderable.
- `Scope-Location` and `Scope-Redirect` are not confused.
- 422 / 204 / 205 / 304 / 5xx behavior is intentional.

## Targeting

- Whole-scope replacement was considered before `scope-swap`.
- `scope-swap` is local, has a stable target and fails closed.
- `Scope-Target` routes a whole response rather than acting like arbitrary OOB DOM targeting.
- `Scope-Event` carries domain facts, not commands or payload transport.
- `revalidate()` is used explicitly rather than hiding refresh loops.
- Planned multi-target syntax is not used unless the installed runtime implements it.

## History and concurrency

- The primary navigation scope owns history.
- Secondary refreshes do not create unrelated history entries.
- Unsafe mutations keep safe overlap semantics.
- `sync="replace"` is not used casually for POST-like requests.
- Newer target navigation cannot be overwritten by an older routed response.
- Lifecycle code distinguishes `ok` from `rendered`.

## Assets and behavior

- Fetched HTML does not depend on inline script/style execution.
- Dynamic assets use documented headers or component mappings.
- Modules are idempotent.
- Product behavior that is not navigation remains in custom elements/application code.
- Dialog/overlay semantics have a single non-sco-pe owner.

## Accessibility

- Busy state remains accurate.
- Focus is preserved or intentionally moved after swaps.
- Secondary updates do not steal focus.
- Status/alert regions exist when announcements are used.
- Validation errors are connected to their fields.
- Same-document hash behavior remains native.

## Security

- Returned HTML is trusted application HTML.
- sco-pe is not being treated as a sanitizer.
- CSP/output encoding remain server responsibilities.
- External asset trust is explicit.
- Trusted Types assumptions match the installed version.

## Version safety

When uncertain, inspect the installed package exports, README, server contract, source and upgrade notes instead of extrapolating from this starter skill or from design-only documents.
