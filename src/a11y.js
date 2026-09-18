import { enumOption, getConfig, log } from "./config.js";
import { isNaturallyFocusable } from "./dom.js";

const liveRegionFrames = new WeakMap();

function resolveTarget(selectorOrElement, fallbackSelector) {
  if (selectorOrElement instanceof Element) return selectorOrElement;
  if (selectorOrElement) return document.querySelector(selectorOrElement);
  return fallbackSelector ? document.querySelector(fallbackSelector) : null;
}

function readMessage(root, selector) {
  const el = root.querySelector?.(selector);
  const text = el?.textContent?.trim();
  return text || null;
}

function updateLiveRegion(target, message) {
  if (!target) return;
  const pending = liveRegionFrames.get(target);
  if (pending) {
    cancelAnimationFrame(pending);
    liveRegionFrames.delete(target);
  }
  if (target.textContent?.trim() !== message) {
    target.textContent = message;
    return;
  }

  // Repeating an identical message often needs a real DOM change to be announced.
  target.textContent = "";
  const frame = requestAnimationFrame(() => {
    liveRegionFrames.delete(target);
    target.textContent = message;
  });
  liveRegionFrames.set(target, frame);
}

export function setBusy(scope, busy) {
  scope.setAttribute("aria-busy", busy ? "true" : "false");
  scope.classList.toggle("is-busy", busy);
  scope.toggleAttribute("busy", busy);
}

export function setRevalidating(scope, revalidating) {
  scope.classList.toggle("is-revalidating", revalidating);
  scope.toggleAttribute("revalidating", revalidating);
}

export function announce(scope, detail = {}) {
  const config = getConfig();
  const mode = enumOption(
    scope.getAttribute("announce") || config.announce,
    ["auto", "status", "alert", "none"],
    "auto",
    "announce",
  );
  if (mode === "none") return;

  const headerStatus = detail.statusMessage?.trim?.() || null;
  const headerAlert = detail.alertMessage?.trim?.() || null;
  const localStatus = headerStatus ? null : readMessage(scope, "[role='status']");
  const localAlert = headerAlert ? null : readMessage(scope, "[role='alert']");
  const statusMessage = headerStatus || localStatus;
  const alertMessage = headerAlert || localAlert;

  if (statusMessage && mode !== "alert") {
    // In-scope live regions announce themselves when inserted. Only mirror
    // header messages into the application's persistent status region.
    if (headerStatus) {
      updateLiveRegion(resolveTarget(config.statusTarget, "#scope-status"), statusMessage);
    }
    scope.dispatchEvent(
      new CustomEvent("scope:status", { bubbles: true, detail: { message: statusMessage } }),
    );
  }

  if (alertMessage && mode !== "status") {
    // Avoid announcing validation summaries twice: a newly inserted role=alert
    // is already live, while Scope-Alert needs the persistent global region.
    if (headerAlert) {
      updateLiveRegion(resolveTarget(config.alertTarget, "#scope-alert"), alertMessage);
    }
    scope.dispatchEvent(
      new CustomEvent("scope:alert", { bubbles: true, detail: { message: alertMessage } }),
    );
  }
}

export function focusAfterSwap(scope, detail = {}) {
  const config = getConfig();
  const mode = enumOption(
    detail.focus || scope.getAttribute("focus") || config.focus,
    ["auto", "heading", "first-error", "keep", "none"],
    "auto",
    "focus",
  );
  if (mode === "none" || mode === "keep") return;
  if (!detail.userInitiated && mode === "auto") return;

  let target = null;

  if (mode === "first-error" || (mode === "auto" && detail.status >= 400)) {
    target = scope.querySelector("[role='alert'][tabindex], [role='alert'], [aria-invalid='true']");
  }

  if (!target && mode === "heading") {
    target = scope.querySelector("h1, h2, [role='heading']");
  }

  if (!target && mode !== "first-error") {
    target = scope.querySelector("[autofocus], h1, h2, [role='heading']");
  }

  if (!target) return;

  if (!target.hasAttribute("tabindex") && !isNaturallyFocusable(target)) {
    target.setAttribute("tabindex", "-1");
  }

  try {
    target.focus({ preventScroll: true });
  } catch (error) {
    log("Could not focus target", error);
  }
}
