# sco-pe and Stimulus

`sco-pe` and Stimulus are not direct substitutes.

They both enhance server-rendered HTML, but they operate at different layers:

- **sco-pe** owns server navigation inside a region;
- **Stimulus** attaches application-defined JavaScript behavior to DOM elements.

In Hotwire's own terminology, Turbo is the coarse-grained navigation layer and Stimulus is the fine-grained behavior layer. From that perspective, Turbo is the closer conceptual comparison to sco-pe. This document compares sco-pe with Stimulus because the two lead to visibly different philosophies in application markup.

## The short version

A sco-pe boundary says:

> Links and forms in this region should keep their native meaning, while navigation is fetched and rendered back into the region.

```html
<sco-pe id="main" history="true">
  <a href="/users">Users</a>

  <form action="/users" method="post">
    ...
  </form>
</sco-pe>
```

A Stimulus controller says:

> This element has a JavaScript behavior object attached to it.

```html
<div data-controller="clipboard">
  <input data-clipboard-target="source" readonly>
  <button data-action="clipboard#copy">Copy</button>
</div>
```

The first is a navigation contract. The second is a behavior contract.

## Shared philosophy

There is meaningful overlap in values.

Both approaches are comfortable with:

- HTML rendered by the server;
- progressive enhancement;
- the DOM as a meaningful part of application state;
- adding behavior to existing HTML rather than client-rendering the whole application;
- standard browser events and APIs;
- small, composable pieces rather than a single client-side application root.

Stimulus describes itself as a modest framework for “the HTML you already have.” Its controllers connect automatically when matching `data-controller` attributes appear in the DOM.

`sco-pe` shares the server-rendered starting point, but deliberately gives itself a much narrower job.

## Different units of composition

| Concern | sco-pe | Stimulus |
| --- | --- | --- |
| Unit | `<sco-pe>` region | Controller instance attached to an element |
| Primary job | Fetch, navigation, swap, history and response lifecycle | Application-specific client-side behavior |
| Markup API | Scope attributes; descendants remain mostly native | `data-controller`, `data-action`, targets, values, classes, outlets |
| JavaScript API | Runtime configuration + lifecycle events/modules | User-defined controller classes |
| Fetching | Built in and standardized | Possible, but implemented by the controller |
| HTML swapping | Built in and standardized | Possible, but implemented by the controller or another library |
| History | Built in per navigation scope | Not a core responsibility |
| DOM observation | Custom element lifecycle | MutationObserver-driven controller lifecycle |
| State model | Mostly server state + scope policy | DOM attributes/values plus controller state |
| Reusable widgets | Prefer custom elements or external modules | Controllers are a primary reuse mechanism |

## Quiet descendants vs annotated behavior

`sco-pe` deliberately removed a general `data-scope-*` language.

Inside a scope, this is meant to be enough:

```html
<a href="/appointments">Appointments</a>

<form action="/appointments" method="post">
  ...
</form>
```

That keeps transport behavior out of individual controls. The scope owns the enhancement.

Stimulus intentionally does the opposite for client behavior. Its annotations are the bridge from HTML to JavaScript:

```html
<div
  data-controller="autosave"
  data-autosave-delay-value="500"
>
  <textarea
    data-autosave-target="input"
    data-action="input->autosave#schedule"
  ></textarea>
</div>
```

That is not accidental markup noise. In Stimulus, locality is part of the design: the HTML declares which controller exists, which elements matter to it, and which events call which methods.

The philosophies are therefore compatible but visibly different.

## Navigation is built in vs navigation is application code

Stimulus does not try to be a navigation framework.

A Stimulus controller can fetch HTML:

```js
export default class extends Controller {
  static values = { url: String }

  async connect() {
    const response = await fetch(this.urlValue)
    this.element.innerHTML = await response.text()
  }
}
```

The Stimulus handbook demonstrates this kind of pattern, but the important detail is that the behavior belongs to application code. The application decides cancellation, error handling, focus, history, swap semantics, concurrency and accessibility.

With sco-pe those decisions are runtime conventions:

```html
<sco-pe
  id="main"
  history="true"
  focus="auto"
  scroll="top"
  sync="queue"
></sco-pe>
```

The trade-off is straightforward:

- Stimulus gives the application a general behavior framework;
- sco-pe removes the need to rewrite the same navigation behavior in application controllers.

## Stimulus is stronger where sco-pe intentionally stops

Examples that fit Stimulus naturally:

- clipboard buttons;
- disclosure behavior;
- keyboard interactions;
- toggles;
- local filtering that does not need the server;
- coordinating several DOM elements;
- timers;
- browser APIs;
- app-specific state machines;
- behavior that needs targets, values or outlets.

These are not jobs sco-pe should absorb.

For reusable, framework-independent controls, sco-pe's current direction also favors custom elements. That gives an application a choice:

- custom element for a reusable UI component with its own public DOM API;
- Stimulus controller for application behavior attached to server markup;
- sco-pe for server navigation.

Those layers can coexist.

## What happens when sco-pe swaps Stimulus markup?

Stimulus continuously observes the DOM.

When a sco-pe swap removes a controller element, Stimulus will disconnect that controller. When new matching markup is inserted, Stimulus connects the corresponding controller for the new element.

That means normal full-scope replacement is conceptually compatible with Stimulus without an explicit re-initialization call.

However, lifecycle identity matters.

`sco-pe` has an optional `keep="same-html"` mode intended to preserve selected expensive islands. Its public preservation contract is aimed primarily at keyed custom elements. Applications should **not** assume that a Stimulus controller instance will retain identity across every sco-pe swap unless that behavior is deliberately included in the preservation policy and covered by tests.

A useful default rule is:

> Treat server replacement as a Stimulus disconnect/reconnect boundary. Preserve a client-owned island only when retaining that exact DOM identity is an intentional application requirement.

That keeps controller lifecycle assumptions clear.

## State ownership

Stimulus explicitly encourages state to live in DOM attributes through typed values:

```html
<div
  data-controller="slideshow"
  data-slideshow-index-value="2"
></div>
```

Controllers can react when values change.

`sco-pe` has a different state story. The durable application state is generally expected to remain on the server or in the URL. The client runtime mostly tracks navigation mechanics: active request, history owner, busy state, scroll/focus policy and temporary lifecycle state.

This difference helps explain why combining the two can work:

- sco-pe can own **where the server-rendered application is**;
- Stimulus can own **what a local piece of already-rendered UI is doing**.

## Events as the seam

Both libraries use DOM events as an integration seam.

sco-pe emits events such as:

```txt
scope:before-load
scope:before-swap
scope:after-swap
scope:load
scope:error
scope:status
scope:alert
```

Stimulus actions can listen to custom events, including events on ancestors, `document` or `window`.

An application that uses both does not need a special adapter. A Stimulus controller can react to sco-pe lifecycle events when there is a real use case, while most controllers can remain unaware that sco-pe exists.

The same rule should apply in the other direction: sco-pe should not gain Stimulus-specific integration logic.

## Symfony context

Stimulus is a natural option in Symfony because it is part of the Symfony UX ecosystem and offers a conventional place for application JavaScript.

That does not mean every dynamic server-rendered interaction needs a Stimulus controller.

A useful separation is:

- **server navigation / CRUD / filters / validation HTML:** sco-pe;
- **self-contained reusable widgets:** custom elements;
- **application-specific browser behavior that does not belong in a component:** Stimulus, if the application wants it.

The point is architectural clarity, not framework loyalty.

## The practical distinction

If a feature can be described as:

> submit this normal form and render the server response back into this region

that is sco-pe territory.

If a feature is better described as:

> when this DOM event occurs, run application JavaScript that coordinates these elements and this client-side state

that is Stimulus territory.

Using that distinction keeps sco-pe from turning into a client behavior framework and keeps Stimulus controllers from becoming an ad hoc navigation stack.

## References

- Stimulus introduction: https://stimulus.hotwired.dev/handbook/introduction
- Stimulus origins and “Turbo up high, Stimulus down low”: https://stimulus.hotwired.dev/handbook/origin
- Stimulus controllers: https://stimulus.hotwired.dev/reference/controllers
- Stimulus actions: https://stimulus.hotwired.dev/reference/actions
- Stimulus targets: https://stimulus.hotwired.dev/reference/targets
- Stimulus values: https://stimulus.hotwired.dev/reference/values
- Stimulus lifecycle callbacks: https://stimulus.hotwired.dev/reference/lifecycle-callbacks
- Stimulus external resources example: https://stimulus.hotwired.dev/handbook/working-with-external-resources
