# sco-pe security notes

## Trust model

sco-pe renders trusted same-origin application HTML. It is not an HTML
sanitizer and not an XSS boundary. Only render responses your application
already trusts enough to serve as its own pages.

## What the runtime removes

Fetched `<script>`, `<style>` and stylesheet `<link>` elements are stripped
before the swap. Executable dependencies travel through `Scope-Script` /
`Scope-Style` as external ES modules and stylesheets, or through the
up-front component registry. External assets are refused by default unless
the application opts in.

## What stays the application's responsibility

Inline event attributes (`onclick`, …), `javascript:` URLs and any other
active content inside trusted HTML remain the server application's
responsibility. Serve a strict Content Security Policy without inline scripts;
that single header does more than any client-side filtering.

## Trusted Types

There is currently no Trusted Types integration: HTML parsing goes through
`template.innerHTML` and `DOMParser`. If an application enables
`require-trusted-types-for 'script'`, parsing needs a dedicated seam rather
than case-by-case workarounds. That work is deferred until a consuming
project actually requires the policy.
