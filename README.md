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
    onLoad: (el) => {
        el.querySelector...
    },
  });
});
```

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

## Other headers

- X-Status
- X-Title
- X-Reload
- X-include-css
- X-include-js

## Examples

See /static folder

## Inspiration

- https://github.com/hotwired/turbo
- https://github.com/unpoly/unpoly
- https://github.com/bigskysoftware/htmx
