import { isNaturallyFocusable } from "./dom.js";
import { getHash } from "./url.js";

function isScrollable(el) {
  if (!(el instanceof Element)) return false;
  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
}

function keyFor(el) {
  if (el === document.scrollingElement) return "document";
  if (el.id) return `#${CSS.escape(el.id)}`;
  return null;
}

function queryByKey(key) {
  if (key === "document") return document.scrollingElement;
  return document.querySelector(key);
}

export function saveScrollPositions(scope) {
  const positions = [];
  const descendants = scope.querySelectorAll?.("[id]") || [];
  const candidates = [document.scrollingElement, scope, ...descendants];

  candidates.forEach((el) => {
    if (!el || !isScrollable(el)) return;
    const key = keyFor(el);
    if (!key) return;
    positions.push({ key, top: el.scrollTop, left: el.scrollLeft });
  });

  return () => {
    positions.forEach(({ key, top, left }) => {
      const el = queryByKey(key);
      if (el) el.scrollTo?.({ top, left, behavior: "auto" });
    });
  };
}

export function scrollScope(scope, mode, url = window.location.href) {
  if (mode === "none" || mode === "keep") return;

  if (mode === "hash") {
    const focused = focusHashTarget(scope, url);
    if (focused) return;
  }

  if (mode === "top") {
    if (scope.scrollHeight > scope.clientHeight) {
      scope.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else {
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }
}

export function focusHashTarget(root = document, url = window.location.href) {
  const hash = getHash(url);
  if (!hash) return false;

  const target = root.querySelector?.(`#${CSS.escape(hash)}`) || document.getElementById(hash);
  if (!target) return false;

  if (!target.hasAttribute("tabindex") && !isNaturallyFocusable(target)) {
    target.setAttribute("tabindex", "-1");
  }

  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
  return true;
}
