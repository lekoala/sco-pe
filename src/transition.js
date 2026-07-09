import { getConfig } from "./config.js";

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function timeoutFor(scope) {
  const local = Number(scope.getAttribute("transition-timeout"));
  if (Number.isFinite(local) && local >= 0) return local;
  return getConfig().transitionTimeout;
}

function transitionMode(scope) {
  const mode = scope.getAttribute("transition") || getConfig().transition || "none";
  return /^[a-z][\w-]*$/i.test(mode) ? mode : "none";
}

function waitForTransition(el, timeout) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("transitionend", finish);
      el.removeEventListener("animationend", finish);
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(finish, timeout);
    el.addEventListener("transitionend", finish);
    el.addEventListener("animationend", finish);
  });
}

export async function replaceChildren(
  scope,
  fragment,
  swap = (target, next) => target.replaceChildren(next),
) {
  const mode = transitionMode(scope);
  if (mode === "none" || prefersReducedMotion()) {
    swap(scope, fragment);
    return;
  }

  const oldHTML = scope.innerHTML;
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
  outgoing.querySelectorAll("[id]").forEach((el) => {
    el.removeAttribute("id");
  });
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

  await waitForTransition(outgoing, timeoutFor(scope));

  outgoing.remove();
  scope.classList.remove("is-transitioning");
  scope.removeAttribute("transitioning");
  if (shouldSetPosition) scope.style.position = oldPosition;

  scope.dispatchEvent(
    new CustomEvent("scope:transition-end", {
      bubbles: true,
      detail: { mode },
    }),
  );
}
