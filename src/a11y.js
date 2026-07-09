import { getConfig, log } from "./config.js";
import { isNaturallyFocusable } from "./dom.js";

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
  const mode = scope.getAttribute("announce") || config.announce || "auto";
  if (mode === "none") return;

  const statusMessage = detail.statusMessage || readMessage(scope, "[role='status']");
  const alertMessage = detail.alertMessage || readMessage(scope, "[role='alert']");

  if (statusMessage && mode !== "alert") {
    const target = resolveTarget(config.statusTarget, "#scope-status, [role='status']");
    if (target) target.textContent = statusMessage;
    scope.dispatchEvent(
      new CustomEvent("scope:status", { bubbles: true, detail: { message: statusMessage } }),
    );
  }

  if (alertMessage && mode !== "status") {
    const target = resolveTarget(config.alertTarget, "#scope-alert, [role='alert']");
    if (target) target.textContent = alertMessage;
    scope.dispatchEvent(
      new CustomEvent("scope:alert", { bubbles: true, detail: { message: alertMessage } }),
    );
  }
}

export function focusAfterSwap(scope, detail = {}) {
  const config = getConfig();
  const mode = detail.focus || scope.getAttribute("focus") || config.focus || "auto";
  if (mode === "none" || mode === "preserve" || mode === "keep") return;
  if (!detail.userInitiated && mode === "auto") return;

  let target = null;

  if (mode === "first-error" || (mode === "auto" && detail.status >= 400)) {
    target = scope.querySelector("[role='alert'], [aria-invalid='true']");
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
