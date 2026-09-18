import { getConfig } from "./config.js";

const activeTransitions = new WeakMap();

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function timeoutFor(scope) {
  if (!scope.hasAttribute("transition-timeout")) return getConfig().transitionTimeout;
  const raw = scope.getAttribute("transition-timeout");
  if (raw == null || raw === "") return getConfig().transitionTimeout;
  const local = Number(raw);
  if (Number.isFinite(local) && local >= 0) return local;
  return getConfig().transitionTimeout;
}

function transitionMode(scope) {
  const mode = scope.getAttribute("transition") || getConfig().transition || "none";
  return /^[a-z][\w-]*$/i.test(mode) ? mode : "none";
}

function cancelTransition(scope) {
  activeTransitions.get(scope)?.cancel();
}

function runTransition(scope, outgoing, mode, timeout, restorePosition) {
  return new Promise((resolve) => {
    let done = false;
    let timer;

    const record = {
      cancel: () => finish(true),
    };

    const finish = (canceled = false, event = null) => {
      if (event && event.target !== outgoing) return;
      if (done) return;
      done = true;
      outgoing.removeEventListener("transitionend", onEnd);
      outgoing.removeEventListener("animationend", onEnd);
      clearTimeout(timer);
      outgoing.remove();

      if (activeTransitions.get(scope) === record) {
        activeTransitions.delete(scope);
        scope.classList.remove("is-transitioning");
        scope.removeAttribute("transitioning");
        restorePosition();
        scope.dispatchEvent(
          new CustomEvent("scope:transition-end", {
            bubbles: true,
            detail: { mode, canceled },
          }),
        );
      }

      resolve();
    };

    const onEnd = (event) => finish(false, event);
    timer = setTimeout(() => finish(false), timeout);
    outgoing.addEventListener("transitionend", onEnd);
    outgoing.addEventListener("animationend", onEnd);
    activeTransitions.set(scope, record);
  });
}

function outgoingHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll("script").forEach((el) => {
    el.remove();
  });
  template.content.querySelectorAll("[id]").forEach((el) => {
    el.removeAttribute("id");
  });

  // Connecting a cloned custom element would run its lifecycle a second time.
  // Replace such nodes with inert light-DOM snapshots for the outgoing layer.
  const customElements = [...template.content.querySelectorAll("*")]
    .filter((el) => el.localName.includes("-"))
    .reverse();
  customElements.forEach((el) => {
    const snapshot = document.createElement("div");
    for (const attr of [...el.attributes]) {
      if (attr.name !== "id" && attr.name !== "is") snapshot.setAttribute(attr.name, attr.value);
    }
    snapshot.classList.add("scope-transition-element");
    snapshot.append(...el.childNodes);
    el.replaceWith(snapshot);
  });

  const container = document.createElement("div");
  container.append(template.content);
  return container.innerHTML;
}

export function replaceChildren(
  scope,
  fragment,
  swap = (target, next) => target.replaceChildren(next),
) {
  cancelTransition(scope);

  const mode = transitionMode(scope);
  if (mode === "none" || prefersReducedMotion()) {
    swap(scope, fragment);
    return;
  }

  const oldHTML = outgoingHTML(scope.innerHTML);
  const oldPosition = scope.style.position;
  const shouldSetPosition = getComputedStyle(scope).position === "static";

  swap(scope, fragment);

  if (!oldHTML.trim()) return;

  if (shouldSetPosition) scope.style.position = "relative";

  const outgoing = document.createElement("div");
  outgoing.className = `scope-outgoing scope-outgoing-${mode}`;
  outgoing.part = "outgoing";
  outgoing.inert = true;
  outgoing.setAttribute("aria-hidden", "true");
  outgoing.innerHTML = oldHTML;
  Object.assign(outgoing.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    zIndex: "1",
  });

  scope.classList.add("is-transitioning");
  scope.setAttribute("transitioning", "");
  scope.appendChild(outgoing);

  scope.dispatchEvent(
    new CustomEvent("scope:transition-start", {
      bubbles: true,
      detail: { mode, outgoing },
    }),
  );

  void runTransition(scope, outgoing, mode, timeoutFor(scope), () => {
    if (shouldSetPosition) scope.style.position = oldPosition;
  });
}
