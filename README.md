# sco-pe

> Scoped elements for your apps

## How it works

Divide your pages into fragments with `sco-pe` elements.

Navigation events within a `sco-pe` element will get processed. The action will be fetched and matching
content will be replaced in the current page.

## Features

- Runs on regular html most of the time
- Updates page head
- Loads scripts & styles
- Use for your whole web page or only parts (eg: a dynamic list)
- Handle any type of event
- Mark active element
- Deal with forms

## Configure

```js
customElements.whenDefined("sco-pe").then(() => {
  // Access through registry
  customElements.get("sco-pe").configure({
    debug: true,
  });
});
```

## Pageload events

If you rely on page load, you need to add your scripts to onLoad property

```js
customElements.whenDefined("sco-pe").then(() => {
  // Access through registry
  customElements.get("sco-pe").configure({
    onLoad: () => {
        el.querySelector...
    },
  });
});
```

onLoad events is triggered after all scripts are executed (external, in order, and inline) and when all scopes are loaded.
It behaves pretty much like a DOMContentLoaded event.

Note that it would probably be much easier to use [self initializing elements instead](https://github.com/lekoala/modular-behaviour.js)

## Messages

You can pass `X-Status` header and display message (alert by default)

```js
customElements.whenDefined("sco-pe").then(() => {
  // Access through registry
  customElements.get("sco-pe").configure({
    statusHandler: (msg, code) => {
      if (code && code === 200) {
        Toasts.success(msg);
      } else {
        Toasts.error(msg);
      }
    },
  });
});
```

Note that X-Status is not read on 3xx response that are opaque to the fetch api.
If needed, you can return "fake" redirects with 2xx and a `X-Location` header.

## Other headers

- X-Status
- X-Title
- X-Reload
- X-include-css
- X-include-js

## Scope fragments

By default, the whole sco-pe element is replaced (old.innerHTML = new.innerHTML).

You may want to have a finer replacement (without having the complexity of something like morphdom).

You can set `data-scope-fragment` attributes. If they are found within the sco-pe, only the fragments will be replaced

In order to determine if a fragment has changed, sco-pe will use `isEqualNode` or the `data-scope-fragment` value, which
can contain some kind of hash of the content in case `isEqualNode` cannot be relied upon (for example, if your content is altered by some third party js)

## Examples

See /static folder

You can also see this working in my minimalistic admin panel:
https://github.com/lekoala/admini

## Inspiration

- https://github.com/hotwired/turbo
- https://github.com/unpoly/unpoly
- https://github.com/bigskysoftware/htmx
