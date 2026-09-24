# Demos

Run the fixture server from the repository root:

```sh
bun run serve
```

Then open [the demo index](http://127.0.0.1:4173/static/index.html).

- **Basic navigation** shows progressively enhanced links, GET and POST forms, `data-confirm`, history, focus, and live status messages.
- **Dashboard scopes** shows separate scopes and `Scope-Target` routing.
- **Server dialog** shows regular links opened in a shared native dialog (Actual CSS owns the dialog, sco-pe owns the content): `422` validation kept open, `Scope-Location` confirm step, `204 + Scope-Status + Scope-Event` close with list refresh.
- **Interactions** shows `autosubmit` and `scope-swap="#product-list"` for live filter forms without focus loss.

The HTML pages and their server responses are deliberately small. They are intended as copyable starting points, not as a production admin interface.
