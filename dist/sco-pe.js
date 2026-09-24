// src/config.js
var DEFAULT_HEADERS = Object.freeze({
  location: "Scope-Location",
  redirect: "Scope-Redirect",
  reload: "Scope-Reload",
  title: "Scope-Title",
  status: "Scope-Status",
  alert: "Scope-Alert",
  script: "Scope-Script",
  style: "Scope-Style",
  select: "Scope-Select",
  target: "Scope-Target",
  event: "Scope-Event"
});
function defaultRenderableResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const mimeType = contentType.split(";", 1)[0].trim().toLowerCase();
  return mimeType === "text/html" || mimeType === "application/xhtml+xml";
}
var DEFAULT_CONFIG = {
  debug: false,
  activeClass: "active",
  requestHeaders: {
    "Scope-Request": "true",
    Accept: "text/html, application/xhtml+xml;q=0.9"
  },
  headers: DEFAULT_HEADERS,
  statusTarget: null,
  alertTarget: null,
  focus: "auto",
  scroll: "top",
  announce: "auto",
  autosubmitDelay: 300,
  timeout: 60000,
  sync: "auto",
  transition: "none",
  transitionTimeout: 250,
  components: {},
  allowExternalAssets: false,
  syncDocumentAttributes: false,
  renderableResponse: defaultRenderableResponse,
  confirmHandler: (message) => Promise.resolve(window.confirm(message)),
  fetch: (...args) => fetch(...args),
  beforeLoad: () => {},
  afterLoad: () => {},
  onLoad: () => {},
  onError: () => {}
};
function enumOption(value, allowed, fallback, name = "option") {
  if (value == null || value === "")
    return fallback;
  if (allowed.includes(value))
    return value;
  log(`Unknown ${name} "${value}", falling back to "${fallback}"`);
  return fallback;
}
var config = { ...DEFAULT_CONFIG, headers: { ...DEFAULT_HEADERS } };
function getConfig() {
  return config;
}
function configure(next = {}) {
  config = {
    ...config,
    ...next,
    requestHeaders: {
      ...config.requestHeaders,
      ...next.requestHeaders || {}
    },
    headers: {
      ...config.headers,
      ...next.headers || {}
    },
    components: {
      ...config.components,
      ...next.components || {}
    }
  };
  return config;
}
function log(message, ...data) {
  if (config.debug) {
    console.log(`[sco-pe] ${message}`, ...data);
  }
}

// src/dom.js
function stripFragmentAssets(root) {
  root.querySelectorAll?.('script, style, link[rel~="stylesheet" i]').forEach((asset) => {
    asset.remove();
  });
  return root;
}
function parseHTML(html) {
  const isFullDocument = /<!doctype\s+html[\s>]/i.test(html) || /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html);
  if (isFullDocument) {
    return {
      isFullDocument: true,
      root: stripFragmentAssets(new DOMParser().parseFromString(html, "text/html"))
    };
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  return {
    isFullDocument: false,
    root: stripFragmentAssets(template.content)
  };
}
function isNodeEmpty(node) {
  return node.textContent.trim() === "" && !node.firstElementChild;
}
function resolvedURL(raw, base) {
  try {
    return new URL(raw, base).href;
  } catch {
    return null;
  }
}
function rewrittenURL(raw, base) {
  if (!raw)
    return null;
  const target = resolvedURL(raw, base);
  if (!target)
    return null;
  return resolvedURL(raw, document.baseURI) === target ? null : target;
}
function resolveSrcset(value, base) {
  return String(value).split(",").map((part) => {
    const tokens = part.trim().split(/\s+/);
    if (!tokens[0])
      return part;
    const url = rewrittenURL(tokens[0], base);
    if (!url)
      return part;
    tokens[0] = url;
    return tokens.join(" ");
  }).join(", ");
}
function resolveFragmentURLs(root, base) {
  if (!base || !root?.querySelectorAll)
    return;
  root.querySelectorAll("img[src], source[src], video[src], audio[src], track[src], iframe[src]").forEach((el) => {
    const url = rewrittenURL(el.getAttribute("src"), base);
    if (url)
      el.setAttribute("src", url);
  });
  root.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
    el.setAttribute("srcset", resolveSrcset(el.getAttribute("srcset"), base));
  });
  root.querySelectorAll("video[poster]").forEach((el) => {
    const url = rewrittenURL(el.getAttribute("poster"), base);
    if (url)
      el.setAttribute("poster", url);
  });
}
function fragmentToHTML(fragment) {
  const div = document.createElement("div");
  div.appendChild(fragment.cloneNode(true));
  return div.innerHTML;
}
function isNaturallyFocusable(el) {
  if (!(el instanceof HTMLElement) || el.hidden || el.hasAttribute("inert"))
    return false;
  if (el.hasAttribute("tabindex"))
    return true;
  if (el.matches("button, input, select, textarea")) {
    return !el.disabled && !el.matches('input[type="hidden"]');
  }
  return el.matches("a[href], area[href], iframe, object, embed, summary, [contenteditable]");
}
function copyDocumentAttributes(doc) {
  if (!(doc instanceof Document))
    return;
  for (const attr of ["class", "dir", "lang"]) {
    const value = doc.documentElement.getAttribute(attr);
    if (value === null) {
      document.documentElement.removeAttribute(attr);
    } else {
      document.documentElement.setAttribute(attr, value);
    }
  }
  for (const key of Object.keys(document.documentElement.dataset)) {
    delete document.documentElement.dataset[key];
  }
  for (const key of Object.keys(doc.documentElement.dataset)) {
    document.documentElement.dataset[key] = doc.documentElement.dataset[key];
  }
}
function copyBodyAttributes(body) {
  if (!body)
    return;
  for (const attr of ["class", "style"]) {
    const value = body.getAttribute(attr);
    if (value === null) {
      document.body.removeAttribute(attr);
    } else {
      document.body.setAttribute(attr, value);
    }
  }
}
var STATE_CLASSES = new Set(["scope-loaded", "is-busy", "is-revalidating", "is-transitioning"]);
var serverClassTokens = new WeakMap;
var SYNCED_SCOPE_ATTRIBUTES = new Set([
  "class",
  "role",
  "title",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-live",
  "aria-atomic"
]);
function mergeClassAttribute(currentScope, value) {
  const previousServer = serverClassTokens.get(currentScope) || new Set;
  const client = new Set([...currentScope.classList].filter((token) => !STATE_CLASSES.has(token) && !previousServer.has(token)));
  const nextServer = new Set(String(value || "").split(/\s+/).filter(Boolean));
  const next = new Set([...client, ...nextServer]);
  for (const token of currentScope.classList) {
    if (STATE_CLASSES.has(token))
      next.add(token);
  }
  serverClassTokens.set(currentScope, nextServer);
  currentScope.setAttribute("class", [...next].join(" "));
}
function copyScopeAttributes(currentScope, nextScope) {
  if (!nextScope)
    return;
  for (const attr of nextScope.attributes) {
    if (!SYNCED_SCOPE_ATTRIBUTES.has(attr.name))
      continue;
    if (attr.name === "class")
      mergeClassAttribute(currentScope, attr.value);
    else
      currentScope.setAttribute(attr.name, attr.value);
  }
  if (!nextScope.hasAttribute("class"))
    mergeClassAttribute(currentScope, "");
}

// src/a11y.js
var liveRegionFrames = new WeakMap;
function resolveTarget(selectorOrElement, fallbackSelector) {
  if (selectorOrElement instanceof Element)
    return selectorOrElement;
  if (selectorOrElement)
    return document.querySelector(selectorOrElement);
  return fallbackSelector ? document.querySelector(fallbackSelector) : null;
}
function readMessage(root, selector) {
  const el = root.querySelector?.(selector);
  const text = el?.textContent?.trim();
  return text || null;
}
function updateLiveRegion(target, message) {
  if (!target)
    return;
  const pending = liveRegionFrames.get(target);
  if (pending) {
    cancelAnimationFrame(pending);
    liveRegionFrames.delete(target);
  }
  if (target.textContent?.trim() !== message) {
    target.textContent = message;
    return;
  }
  target.textContent = "";
  const frame = requestAnimationFrame(() => {
    liveRegionFrames.delete(target);
    target.textContent = message;
  });
  liveRegionFrames.set(target, frame);
}
function setBusy(scope, busy) {
  scope.setAttribute("aria-busy", busy ? "true" : "false");
  scope.classList.toggle("is-busy", busy);
  scope.toggleAttribute("busy", busy);
}
function setRevalidating(scope, revalidating) {
  scope.classList.toggle("is-revalidating", revalidating);
  scope.toggleAttribute("revalidating", revalidating);
}
function announce(scope, detail = {}) {
  const config = getConfig();
  const mode = enumOption(scope.getAttribute("announce") || config.announce, ["auto", "status", "alert", "none"], "auto", "announce");
  if (mode === "none")
    return;
  const headerStatus = detail.statusMessage?.trim?.() || null;
  const headerAlert = detail.alertMessage?.trim?.() || null;
  const localStatus = headerStatus ? null : readMessage(scope, "[role='status']");
  const localAlert = headerAlert ? null : readMessage(scope, "[role='alert']");
  const statusMessage = headerStatus || localStatus;
  const alertMessage = headerAlert || localAlert;
  if (statusMessage && mode !== "alert") {
    if (headerStatus) {
      updateLiveRegion(resolveTarget(config.statusTarget, "#scope-status"), statusMessage);
    }
    scope.dispatchEvent(new CustomEvent("scope:status", { bubbles: true, detail: { message: statusMessage } }));
  }
  if (alertMessage && mode !== "status") {
    if (headerAlert) {
      updateLiveRegion(resolveTarget(config.alertTarget, "#scope-alert"), alertMessage);
    }
    scope.dispatchEvent(new CustomEvent("scope:alert", { bubbles: true, detail: { message: alertMessage } }));
  }
}
function focusAfterSwap(scope, detail = {}) {
  const config = getConfig();
  const mode = enumOption(detail.focus || scope.getAttribute("focus") || config.focus, ["auto", "heading", "first-error", "keep", "none"], "auto", "focus");
  if (mode === "none" || mode === "keep")
    return;
  if (!detail.userInitiated && mode === "auto")
    return;
  let target = null;
  if (mode === "first-error" || mode === "auto" && detail.status >= 400) {
    target = scope.querySelector("[role='alert'][tabindex], [role='alert'], [aria-invalid='true']");
  }
  if (!target && mode === "heading") {
    target = scope.querySelector("h1, h2, [role='heading']");
  }
  if (!target && mode !== "first-error") {
    target = scope.querySelector("[autofocus], h1, h2, [role='heading']");
  }
  if (!target)
    return;
  if (!target.hasAttribute("tabindex") && !isNaturallyFocusable(target)) {
    target.setAttribute("tabindex", "-1");
  }
  try {
    target.focus({ preventScroll: true });
  } catch (error) {
    log("Could not focus target", error);
  }
}

// src/url.js
function expandURL(value) {
  const href = value == null ? "#" : String(value);
  return new URL(href, document.baseURI);
}
function isSameOrigin(value) {
  return expandURL(value).origin === window.location.origin;
}
function isExternalURL(value) {
  return value ? !isSameOrigin(value) : false;
}
function hasExternalTarget(el, attribute = "target") {
  const target = el?.getAttribute?.(attribute);
  return Boolean(target && target.toLowerCase() !== "_self");
}
function getHash(value) {
  const url = expandURL(value);
  return url.hash ? url.hash.slice(1) : null;
}
function isSameDocumentAnchor(value) {
  if (value == null)
    return false;
  const raw = String(value);
  if (!raw.includes("#"))
    return false;
  const url = expandURL(raw);
  const here = new URL(window.location.href);
  url.hash = "";
  here.hash = "";
  return url.href === here.href;
}
function stripHash(value) {
  const url = expandURL(value);
  url.hash = "";
  return url.href.replace(/\/$/, "");
}
function splitHeader(value) {
  if (!value)
    return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}
function decodeHeader(value) {
  if (!value)
    return value;
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

// src/assets.js
var modulePromises = new Map;
var stylePromises = new Map;
function assertAllowedAsset(url) {
  const config = getConfig();
  if (!config.allowExternalAssets && !isSameOrigin(url)) {
    throw new Error(`External scope asset blocked: ${url}`);
  }
}
function retryable(map, key, load) {
  if (!map.has(key)) {
    const promise = Promise.resolve().then(load).catch((error) => {
      map.delete(key);
      throw error;
    });
    map.set(key, promise);
  }
  return map.get(key);
}
function abortedReason(signal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted", "AbortError");
}
function abortable(promise, signal) {
  if (!signal)
    return promise;
  if (signal.aborted)
    return Promise.reject(abortedReason(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortedReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

class AssetLoader {
  async loadStyles(hrefs = [], signal) {
    await Promise.all(hrefs.map((href) => abortable(this.loadStyle(href), signal)));
  }
  async loadScripts(srcs = [], signal) {
    await Promise.all(srcs.map((src) => abortable(this.loadModule(src), signal)));
  }
  loadStyle(href) {
    const url = expandURL(href).href;
    assertAllowedAsset(url);
    return retryable(stylePromises, url, () => {
      const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find((link) => link.href === url);
      if (existing?.sheet)
        return existing;
      log(`Loading style ${url}`);
      const link = existing || document.createElement("link");
      if (!existing) {
        link.rel = "stylesheet";
        link.href = url;
        document.head.appendChild(link);
      }
      return new Promise((resolve, reject) => {
        link.addEventListener("load", () => resolve(link), { once: true });
        link.addEventListener("error", () => reject(new Error(`Could not load scope style: ${url}`)), { once: true });
      });
    });
  }
  loadModule(src) {
    const url = expandURL(src).href;
    assertAllowedAsset(url);
    return retryable(modulePromises, url, () => {
      log(`Loading module ${url}`);
      return import(url);
    });
  }
  async loadRegisteredComponents(root, signal) {
    const config = getConfig();
    const tags = new Set;
    root.querySelectorAll?.("*").forEach((el) => {
      const tag = el.localName;
      if (tag?.includes("-") && tag !== "sco-pe" && !customElements.get(tag)) {
        tags.add(tag);
      }
    });
    await Promise.all([...tags].map(async (tag) => {
      const src = config.components?.[tag];
      if (!src) {
        log(`No registered module for <${tag}>`);
        return;
      }
      await abortable(this.loadModule(src), signal);
      if (!customElements.get(tag)) {
        throw new Error(`Registered module did not define <${tag}>: ${src}`);
      }
    }));
  }
}
var assets = new AssetLoader;

// src/keep.js
var snapshots = new WeakMap;
function isCustomElement(el) {
  return el?.localName?.includes("-") && el.localName !== "sco-pe";
}
function defaultCandidate(el) {
  return isCustomElement(el) && Boolean(el.id);
}
function selectorMatches(scope, el) {
  const selector = scope.getAttribute("keep-selector");
  return selector ? el.matches?.(selector) : defaultCandidate(el);
}
function candidates(root, selector) {
  if (selector)
    return [...root.querySelectorAll?.(selector) || []];
  return [...root.querySelectorAll?.("[id]") || []].filter(defaultCandidate);
}
function shouldKeep(scope, current, next) {
  if (!(current instanceof Element) || !(next instanceof Element))
    return false;
  if (enumOption(scope.getAttribute("keep"), ["none", "same-html"], "none", "keep") !== "same-html")
    return false;
  if (!current.id || current.id !== next.id)
    return false;
  if (!selectorMatches(scope, current))
    return false;
  const currentHTML = snapshots.get(current) || current.outerHTML;
  return currentHTML === next.outerHTML;
}
function sameElement(current, next) {
  if (!(current instanceof Element) || !(next instanceof Element))
    return false;
  if (current.localName !== next.localName)
    return false;
  if (current.id || next.id)
    return current.id === next.id;
  return true;
}
function syncAttributes(current, next) {
  for (const attr of [...current.attributes]) {
    if (!next.hasAttribute(attr.name))
      current.removeAttribute(attr.name);
  }
  for (const attr of [...next.attributes]) {
    if (current.getAttribute(attr.name) !== attr.value)
      current.setAttribute(attr.name, attr.value);
  }
}
function syncFormState(current, next) {
  if (current instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    if (current.type !== "file")
      current.value = next.value;
    current.checked = next.checked;
    return;
  }
  if (current instanceof HTMLTextAreaElement && next instanceof HTMLTextAreaElement) {
    current.value = next.value;
    return;
  }
  if (current instanceof HTMLOptionElement && next instanceof HTMLOptionElement) {
    current.selected = next.selected;
  }
}
function directChildById(parent, id) {
  return [...parent.children].find((child) => child.id === id) || null;
}
function morphNode(scope, current, next) {
  if (current === next)
    return current;
  if (shouldKeep(scope, current, next))
    return current;
  if (current.nodeType !== next.nodeType) {
    current.replaceWith(next);
    return next;
  }
  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== next.nodeValue)
      current.nodeValue = next.nodeValue;
    return current;
  }
  if (!sameElement(current, next) || isCustomElement(current)) {
    current.replaceWith(next);
    return next;
  }
  syncAttributes(current, next);
  morphChildren(scope, current, next);
  syncFormState(current, next);
  return current;
}
function moveBefore(parent, node, reference) {
  if (typeof parent.moveBefore === "function")
    parent.moveBefore(node, reference);
  else
    parent.insertBefore(node, reference);
}
function keyedIds(nodes) {
  return new Set(nodes.filter((node) => node instanceof Element && node.id).map((node) => node.id));
}
function morphChildren(scope, currentParent, nextParent) {
  const nextNodes = [...nextParent.childNodes];
  let cursor = currentParent.firstChild;
  for (let index = 0;index < nextNodes.length; index += 1) {
    const next = nextNodes[index];
    let current = cursor;
    if (next instanceof Element && next.id) {
      const matching = directChildById(currentParent, next.id);
      if (matching) {
        if (matching !== cursor) {
          const marker = document.createComment("scope-cursor");
          currentParent.insertBefore(marker, cursor);
          const laterIds = keyedIds(nextNodes.slice(index + 1));
          let skipped = marker.nextSibling;
          while (skipped && skipped !== matching) {
            const following = skipped.nextSibling;
            const neededLater = skipped instanceof Element && skipped.id && laterIds.has(skipped.id);
            if (!neededLater)
              skipped.remove();
            skipped = following;
          }
          if (matching !== marker.nextSibling) {
            moveBefore(currentParent, matching, marker.nextSibling);
          }
          marker.remove();
        }
        current = matching;
      } else {
        currentParent.insertBefore(next, cursor);
        current = next;
      }
    } else if (cursor instanceof Element && cursor.id) {
      currentParent.insertBefore(next, cursor);
      current = next;
    } else if (!current) {
      currentParent.appendChild(next);
      current = next;
    }
    const rendered = morphNode(scope, current, next);
    cursor = rendered.nextSibling;
  }
  while (cursor) {
    const following = cursor.nextSibling;
    cursor.remove();
    cursor = following;
  }
}
function rememberKeptElements(scope) {
  const mode = enumOption(scope.getAttribute("keep"), ["none", "same-html"], "none", "keep");
  if (mode === "none")
    return;
  const selector = scope.getAttribute("keep-selector");
  for (const el of candidates(scope, selector)) {
    if (!el.id)
      continue;
    if (!snapshots.has(el))
      snapshots.set(el, el.outerHTML);
  }
}
function snapshotKeptElements(scope, root) {
  const selector = scope.getAttribute("keep-selector");
  return candidates(root, selector).filter((el) => selectorMatches(scope, el) && el.id).map((el) => ({ id: el.id, html: el.outerHTML }));
}
function rememberServerSnapshots(scope, snapshotsFromServer) {
  for (const { id, html } of snapshotsFromServer) {
    const el = scope.querySelector(`#${CSS.escape(id)}`);
    if (el)
      snapshots.set(el, html);
  }
}
function createReplacementFragment(_scope, html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}
function swapKeptChildren(scope, fragment) {
  if (enumOption(scope.getAttribute("keep"), ["none", "same-html"], "none", "keep") === "same-html") {
    morphChildren(scope, scope, fragment);
  } else {
    scope.replaceChildren(fragment);
  }
}

// src/scroll.js
function isScrollable(el) {
  if (!(el instanceof Element))
    return false;
  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
}
function keyFor(el) {
  if (el === document.scrollingElement)
    return "document";
  if (el.id)
    return `#${CSS.escape(el.id)}`;
  return null;
}
function queryByKey(key) {
  if (key === "document")
    return document.scrollingElement;
  return document.querySelector(key);
}
function saveScrollPositions(scope) {
  const positions = [];
  const descendants = scope.querySelectorAll?.("[id]") || [];
  const candidates = [document.scrollingElement, scope, ...descendants];
  candidates.forEach((el) => {
    if (!el || !isScrollable(el))
      return;
    const key = keyFor(el);
    if (!key)
      return;
    positions.push({ key, top: el.scrollTop, left: el.scrollLeft });
  });
  return () => {
    positions.forEach(({ key, top, left }) => {
      const el = queryByKey(key);
      if (el)
        el.scrollTo?.({ top, left, behavior: "auto" });
    });
  };
}
function scrollScope(scope, mode, url = window.location.href) {
  if (mode === "none" || mode === "keep")
    return;
  if (mode === "hash") {
    const focused = focusHashTarget(scope, url);
    if (focused)
      return;
  }
  if (mode === "top") {
    if (scope.scrollHeight > scope.clientHeight) {
      scope.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else {
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }
}
function focusHashTarget(root = document, url = window.location.href) {
  const hash = getHash(url);
  if (!hash)
    return false;
  const target = root.querySelector?.(`#${CSS.escape(hash)}`) || document.getElementById(hash);
  if (!target)
    return false;
  if (!target.hasAttribute("tabindex") && !isNaturallyFocusable(target)) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
  return true;
}

// src/transition.js
var activeTransitions = new WeakMap;
function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}
function timeoutFor(scope) {
  if (!scope.hasAttribute("transition-timeout"))
    return getConfig().transitionTimeout;
  const raw = scope.getAttribute("transition-timeout");
  if (raw == null || raw === "")
    return getConfig().transitionTimeout;
  const local = Number(raw);
  if (Number.isFinite(local) && local >= 0)
    return local;
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
      cancel: () => finish(true)
    };
    const finish = (canceled = false, event = null) => {
      if (event && event.target !== outgoing)
        return;
      if (done)
        return;
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
        scope.dispatchEvent(new CustomEvent("scope:transition-end", {
          bubbles: true,
          detail: { mode, canceled }
        }));
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
  const customElements2 = [...template.content.querySelectorAll("*")].filter((el) => el.localName.includes("-")).reverse();
  customElements2.forEach((el) => {
    const snapshot = document.createElement("div");
    for (const attr of [...el.attributes]) {
      if (attr.name !== "id" && attr.name !== "is")
        snapshot.setAttribute(attr.name, attr.value);
    }
    snapshot.classList.add("scope-transition-element");
    snapshot.append(...el.childNodes);
    el.replaceWith(snapshot);
  });
  const container = document.createElement("div");
  container.append(template.content);
  return container.innerHTML;
}
function replaceChildren(scope, fragment, swap = (target, next) => target.replaceChildren(next)) {
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
  if (!oldHTML.trim())
    return;
  if (shouldSetPosition)
    scope.style.position = "relative";
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
    zIndex: "1"
  });
  scope.classList.add("is-transitioning");
  scope.setAttribute("transitioning", "");
  scope.appendChild(outgoing);
  scope.dispatchEvent(new CustomEvent("scope:transition-start", {
    bubbles: true,
    detail: { mode, outgoing }
  }));
  runTransition(scope, outgoing, mode, timeoutFor(scope), () => {
    if (shouldSetPosition)
      scope.style.position = oldPosition;
  });
}

// src/Scope.js
var FORM_FIELD_SELECTOR = "input, select, textarea";
function parseBool(value, fallback = false) {
  if (value == null || value === "")
    return fallback;
  return ["1", "true", true, 1, "yes"].includes(value);
}
function mergeRequestHeaders(base, override) {
  const headers = new Headers(base || {});
  new Headers(override || {}).forEach((value, name) => {
    headers.set(name, value);
  });
  return headers;
}
function combineSignals(controller, ...externalSignals) {
  const signals = externalSignals.filter(Boolean);
  if (!signals.length)
    return controller.signal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([controller.signal, ...signals]);
  }
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
function createTimeoutSignal(ms) {
  if (!(ms > 0))
    return null;
  const controller = new AbortController;
  const timer = setTimeout(() => {
    controller.abort(new DOMException("The operation timed out", "TimeoutError"));
  }, ms);
  return {
    signal: controller.signal,
    timedOut: () => controller.signal.aborted,
    dispose: () => clearTimeout(timer)
  };
}
function throwIfAborted(signal) {
  if (!signal?.aborted)
    return;
  if (signal.reason instanceof Error)
    throw signal.reason;
  throw new DOMException("The operation was aborted", "AbortError");
}
function numberAttribute(el, name, fallback) {
  if (!el?.hasAttribute?.(name))
    return fallback;
  const raw = el.getAttribute(name);
  if (raw == null || raw === "")
    return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
function scopeOption(name, scope, fallback = null) {
  if (scope?.hasAttribute?.(name))
    return scope.getAttribute(name);
  return fallback;
}
function getAction(formOrLink, submitter = null) {
  if (submitter?.hasAttribute?.("formaction"))
    return submitter.getAttribute("formaction");
  if (formOrLink instanceof HTMLFormElement) {
    return formOrLink.getAttribute("action") || window.location.href;
  }
  return formOrLink.getAttribute("href");
}
function getMethod(formOrLink, submitter = null) {
  if (submitter?.hasAttribute?.("formmethod")) {
    return submitter.getAttribute("formmethod").toUpperCase();
  }
  return (formOrLink.getAttribute("method") || "GET").toUpperCase();
}
function getEncoding(form, submitter = null) {
  return (submitter?.getAttribute?.("formenctype") || form.getAttribute("enctype") || "application/x-www-form-urlencoded").toLowerCase();
}
function hasExternalTarget2(el, submitter = null) {
  return hasExternalTarget(submitter, "formtarget") || hasExternalTarget(el);
}
function shouldIgnore(el, submitter = null) {
  const action = getAction(el, submitter);
  const method = getMethod(el, submitter);
  return !action || method === "DIALOG" || el.matches?.("a[download]") || hasExternalTarget2(el, submitter) || isExternalURL(action) || isSameDocumentAnchor(action);
}
function isModifiedClick(event) {
  return event.type === "click" && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}
function findClickTrigger(event) {
  return event.target.closest?.("a[href]");
}
function submitterFrom(event) {
  return event?.submitter || null;
}
function formDataFor(form, submitter) {
  if (submitter) {
    try {
      return new FormData(form, submitter);
    } catch {
      const formData = new FormData(form);
      if (submitter.name && !submitter.disabled)
        formData.append(submitter.name, submitter.value ?? "");
      return formData;
    }
  }
  return new FormData(form);
}
function paramsFromFormData(formData) {
  const params = new URLSearchParams;
  for (const [name, value] of formData) {
    params.append(name, value instanceof File ? value.name : value);
  }
  return params;
}
function plainTextFromFormData(formData) {
  return [...formData].map(([name, value]) => `${name}=${value instanceof File ? value.name : value}`).join(`\r
`);
}
function buildRequest(trigger, event) {
  const submitter = submitterFrom(event);
  const action = getAction(trigger, submitter);
  const url = expandURL(action);
  const method = getMethod(trigger, submitter);
  const headers = {};
  let body = null;
  if (trigger instanceof HTMLFormElement) {
    const formData = formDataFor(trigger, submitter);
    if (method === "GET" || method === "HEAD") {
      url.search = paramsFromFormData(formData).toString();
    } else {
      const encoding = getEncoding(trigger, submitter);
      if (encoding === "multipart/form-data") {
        body = formData;
      } else if (encoding === "text/plain") {
        body = plainTextFromFormData(formData);
        headers["Content-Type"] = "text/plain;charset=UTF-8";
      } else {
        body = paramsFromFormData(formData);
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      }
    }
  }
  return { url: url.href, method, body, headers, submitter };
}
function sameHistoryURL(a, b) {
  if (!a || !b)
    return false;
  return stripHash(a) === stripHash(b);
}
function eventDetail(extra = {}) {
  return { bubbles: true, cancelable: false, detail: extra };
}
function emitScopeEvents(scope, events, detail = {}) {
  if (!events?.length)
    return;
  for (const name of events) {
    scope.dispatchEvent(new CustomEvent("scope:event", eventDetail({ ...detail, name })));
  }
}
function holdMinHeight(scope) {
  const value = scope.style.getPropertyValue("min-height");
  const priority = scope.style.getPropertyPriority("min-height");
  scope.style.minHeight = `${scope.clientHeight}px`;
  return () => {
    if (value)
      scope.style.setProperty("min-height", value, priority);
    else
      scope.style.removeProperty("min-height");
  };
}
function isSafeMethod(method) {
  return method === "GET" || method === "HEAD";
}
function isFieldEvent(event) {
  return event.type === "input" || event.type === "change";
}
function isSubmittableField(el) {
  if (!el?.matches?.(FORM_FIELD_SELECTOR))
    return false;
  if (el.disabled || !el.name)
    return false;
  return !["button", "submit", "reset", "file"].includes(el.type);
}
function confirmationMessage(trigger, submitter = null) {
  if (submitter?.hasAttribute?.("data-confirm"))
    return submitter.getAttribute("data-confirm");
  return trigger.getAttribute?.("data-confirm") ?? null;
}

class Scope extends HTMLElement {
  #initialized = false;
  #initializing = false;
  #initSequence = 0;
  #abortController = null;
  #activeRequestId = null;
  #requestSequence = 0;
  #operationSequence = 0;
  #activeOperation = null;
  #pendingRequest = null;
  #autosubmitTimer = null;
  static configure(next) {
    return configure(next);
  }
  static get config() {
    return getConfig();
  }
  static get observedAttributes() {
    return ["src"];
  }
  get src() {
    return this.getAttribute("src");
  }
  set src(value) {
    if (value == null)
      this.removeAttribute("src");
    else
      this.setAttribute("src", value);
  }
  connectedCallback() {
    this.addEventListener("click", this);
    this.addEventListener("submit", this);
    this.addEventListener("input", this);
    this.addEventListener("change", this);
    if (this.#initialized || this.#initializing) {
      this.markActiveLinks();
      return;
    }
    this.#initializing = true;
    const initToken = ++this.#initSequence;
    queueMicrotask(async () => {
      if (initToken !== this.#initSequence)
        return;
      if (!this.isConnected || this.#initialized) {
        this.#initializing = false;
        return;
      }
      log(`Scope init ${this.id || "(no id)"}`);
      try {
        const initial = await this.loadContent({ checkExisting: true, userInitiated: false });
        if (!initial.rendered && !this.isConnected) {
          this.#initializing = false;
          return;
        }
        this.#initialized = true;
        this.#initializing = false;
        this.markActiveLinks();
        rememberKeptElements(this);
        log(`Scope ready ${this.id || "(no id)"}`);
      } catch (error) {
        this.#initializing = false;
        if (!this.isConnected)
          return;
        this.#initialized = true;
        const result = {
          ok: false,
          rendered: false,
          error,
          status: 0,
          userInitiated: false
        };
        this.dispatchEvent(new CustomEvent("scope:error", eventDetail(result)));
        await getConfig().onError(this, result);
        await this.afterLoad(result);
      }
    });
  }
  disconnectedCallback() {
    this.#initializing = false;
    this.abortLoading();
    clearTimeout(this.#autosubmitTimer);
    this.removeEventListener("click", this);
    this.removeEventListener("submit", this);
    this.removeEventListener("input", this);
    this.removeEventListener("change", this);
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.#initialized || oldValue === newValue)
      return;
    if (name === "src") {
      this.loadContent({ checkExisting: false, userInitiated: false });
    }
  }
  handleEvent(event) {
    if (event.target.closest?.("sco-pe") !== this)
      return;
    if (event.defaultPrevented)
      return;
    if (this.hasAttribute("disabled") && this.getAttribute("disabled") !== "false")
      return;
    if (isModifiedClick(event))
      return;
    if (isFieldEvent(event) && this.handleAutosubmit(event))
      return;
    const trigger = event.type === "submit" ? event.target : findClickTrigger(event);
    if (!trigger)
      return;
    const submitter = submitterFrom(event);
    const action = getAction(trigger, submitter);
    if (event.type === "click" && isSameDocumentAnchor(action)) {
      setTimeout(() => focusHashTarget(document, action), 0);
      return;
    }
    if (shouldIgnore(trigger, submitter))
      return;
    event.preventDefault();
    this.handleNavigation(trigger, event).catch((error) => {
      this.dispatchEvent(new CustomEvent("scope:error", eventDetail({ error })));
    });
  }
  async handleNavigation(trigger, event) {
    const message = confirmationMessage(trigger, submitterFrom(event));
    if (message !== null && !await getConfig().confirmHandler(message))
      return;
    await this.load(trigger, event, { userInitiated: true });
  }
  handleAutosubmit(event) {
    if (!this.hasAttribute("autosubmit"))
      return false;
    if (event.isComposing)
      return false;
    const field = event.target;
    if (!isSubmittableField(field))
      return false;
    const form = field.form || field.closest?.("form");
    if (!form || !this.contains(form))
      return false;
    if (getMethod(form) !== "GET")
      return false;
    if (shouldIgnore(form))
      return false;
    const delay = numberAttribute(this, "autosubmit", getConfig().autosubmitDelay);
    clearTimeout(this.#autosubmitTimer);
    this.#autosubmitTimer = setTimeout(() => {
      if (!form.noValidate && typeof form.checkValidity === "function" && !form.checkValidity()) {
        return;
      }
      this.load(form, null, { userInitiated: true, autosubmit: true }).catch((error) => {
        this.dispatchEvent(new CustomEvent("scope:error", eventDetail({ error })));
      });
    }, delay);
    return true;
  }
  abortLoading({ cleanup = true } = {}) {
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
    this.#activeRequestId = null;
    this.#activeOperation = null;
    if (cleanup) {
      setBusy(this, false);
      setRevalidating(this, false);
      this.#dropPendingRequest();
    }
  }
  #claimOperation() {
    this.abortLoading({ cleanup: false });
    const id = ++this.#operationSequence;
    this.#activeOperation = id;
    return id;
  }
  #isCurrentOperation(id) {
    return id != null && this.#activeOperation === id;
  }
  #assertOperation(id, signal) {
    throwIfAborted(signal);
    if (!this.#isCurrentOperation(id)) {
      throw new DOMException("The operation was superseded", "AbortError");
    }
  }
  #requestInFlight() {
    return this.#abortController !== null;
  }
  #enqueueRequest(start) {
    const previous = this.#pendingRequest;
    if (previous) {
      this.#pendingRequest = null;
      previous.resolve({ ok: false, dropped: true, superseded: true, aborted: false });
    }
    return new Promise((resolve, reject) => {
      this.#pendingRequest = { start, resolve, reject };
    });
  }
  #flushPendingRequest() {
    const pending = this.#pendingRequest;
    if (!pending)
      return;
    this.#pendingRequest = null;
    pending.start().then(pending.resolve, pending.reject);
  }
  #dropPendingRequest() {
    const pending = this.#pendingRequest;
    if (!pending)
      return;
    this.#pendingRequest = null;
    pending.resolve({ ok: false, dropped: true, aborted: true, rendered: false });
  }
  reload(options = {}) {
    const state = history.state?.scope;
    const currentHistoryURL = state?.id === this.id ? state.url : null;
    const url = options.url || currentHistoryURL || this.src || window.location.href;
    return this.loadURL(url, { method: "GET" }, {
      userInitiated: Boolean(options.userInitiated),
      revalidating: Boolean(options.revalidate || options.revalidating),
      scroll: options.scroll,
      focus: options.focus
    });
  }
  revalidate(options = {}) {
    return this.reload({ ...options, revalidate: true });
  }
  async load(trigger, event = null, context = {}) {
    const { url, method, body, headers, submitter } = buildRequest(trigger, event);
    const isLink = trigger.matches?.("a[href]");
    const select = scopeOption("select", this);
    const scroll = enumOption(scopeOption("scroll", this, getConfig().scroll), ["top", "keep", "none", "hash"], "top", "scroll");
    const focus = enumOption(scopeOption("focus", this, getConfig().focus), ["auto", "heading", "first-error", "keep", "none"], "auto", "focus");
    const target = scopeOption("target", this);
    const useHistory = this.shouldUseHistory() && isSafeMethod(method) && (isLink || trigger instanceof HTMLFormElement);
    const submitterWasDisabled = submitter?.disabled;
    if (submitter)
      submitter.disabled = true;
    const start = () => this.loadURL(url, { method, body, headers }, { ...context, trigger, select, scroll, focus, target });
    const rawSync = scopeOption("sync", this, getConfig().sync);
    const syncOption = enumOption(rawSync, ["auto", "replace", "queue", "drop"], "auto", "sync");
    const sync = syncOption === "auto" ? isSafeMethod(method) ? "replace" : "drop" : syncOption;
    let pending = null;
    if (sync !== "replace" && this.#requestInFlight()) {
      if (sync === "drop") {
        this.dispatchEvent(new CustomEvent("scope:sync-dropped", eventDetail({ url: expandURL(url).href, method: String(method || "GET") })));
        pending = Promise.resolve({ ok: false, dropped: true, aborted: false, rendered: false });
      } else if (sync === "queue") {
        pending = this.#enqueueRequest(start);
      }
    }
    try {
      const result = await (pending || start());
      if (useHistory && result.ok && !result.aborted) {
        this.updateHistory(result.url || url, select, { replace: Boolean(context.autosubmit) });
      }
      if (result.ok && !result.aborted) {
        const activeURL = useHistory ? window.location.href : isLink ? result.url || url : undefined;
        this.markActiveLinks(activeURL);
        const targetScope = result.target ? document.getElementById(result.target) : null;
        if (targetScope instanceof Scope && targetScope !== this) {
          targetScope.markActiveLinks(activeURL);
        }
      }
      return result;
    } finally {
      if (submitter)
        submitter.disabled = Boolean(submitterWasDisabled);
    }
  }
  async loadContent({ checkExisting = false, userInitiated = false } = {}) {
    if (!this.src) {
      await this.prepareExistingContent();
      await this.afterLoad({ ok: true, rendered: true, status: 200, userInitiated });
      return { ok: true, rendered: true };
    }
    if (checkExisting && !isNodeEmpty(this)) {
      await this.prepareExistingContent();
      await this.afterLoad({ ok: true, rendered: true, status: 200, userInitiated });
      return { ok: true, rendered: true };
    }
    return this.loadURL(this.src, { method: "GET" }, { userInitiated });
  }
  async prepareExistingContent() {
    rememberKeptElements(this);
    await assets.loadRegisteredComponents(this);
  }
  async loadURL(url, fetchOptions = {}, context = {}) {
    const config = getConfig();
    const absoluteUrl = expandURL(url).href;
    const controller = new AbortController;
    const requestId = ++this.#requestSequence;
    const timeout = numberAttribute(this, "timeout", config.timeout);
    const timeoutHandle = createTimeoutSignal(timeout);
    const options = {
      method: "GET",
      ...fetchOptions,
      headers: mergeRequestHeaders(config.requestHeaders, fetchOptions.headers),
      signal: combineSignals(controller, fetchOptions.signal, timeoutHandle?.signal)
    };
    const before = new CustomEvent("scope:before-load", {
      bubbles: true,
      cancelable: true,
      detail: {
        url: absoluteUrl,
        options,
        trigger: context.trigger || null,
        revalidating: Boolean(context.revalidating)
      }
    });
    this.dispatchEvent(before);
    if (before.defaultPrevented) {
      controller.abort();
      return { ok: false, aborted: true };
    }
    const operationId = this.#claimOperation();
    this.#abortController = controller;
    this.#activeRequestId = requestId;
    setBusy(this, true);
    setRevalidating(this, Boolean(context.revalidating));
    let afterLoadStarted = false;
    let responseStatus = 0;
    try {
      await config.beforeLoad(this, before.detail);
      log(`${options.method || "GET"} ${absoluteUrl}`);
      const response = await config.fetch(absoluteUrl, options);
      responseStatus = response.status;
      const result = await this.processResponse(response, {
        ...context,
        requestUrl: absoluteUrl,
        signal: options.signal,
        operationId
      });
      if (this.#activeRequestId === requestId && !result.stale) {
        afterLoadStarted = true;
        await this.afterLoad(result);
      }
      return result;
    } catch (error) {
      const timedOut = timeoutHandle?.timedOut() === true || error?.name === "TimeoutError";
      const aborted = !timedOut && error?.name === "AbortError";
      const stale = this.#activeRequestId !== requestId;
      const result = {
        ok: false,
        error,
        aborted,
        timedOut,
        stale,
        rendered: false,
        status: responseStatus,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating
      };
      if (!aborted && !stale) {
        this.dispatchEvent(new CustomEvent("scope:error", eventDetail(result)));
        await config.onError(this, result);
      }
      if (!stale && !afterLoadStarted) {
        afterLoadStarted = true;
        await this.afterLoad(result);
      }
      return result;
    } finally {
      timeoutHandle?.dispose();
      if (this.#activeRequestId === requestId) {
        setBusy(this, false);
        setRevalidating(this, false);
        this.#activeRequestId = null;
        this.#abortController = null;
        if (this.#isCurrentOperation(operationId))
          this.#activeOperation = null;
        this.#flushPendingRequest();
      }
    }
  }
  async processResponse(response, context = {}) {
    throwIfAborted(context.signal);
    const config = getConfig();
    const status = response.status;
    const ok = response.ok || status === 304;
    const responseHeaders = this.readHeaders(response);
    const headerDetail = {
      ...responseHeaders,
      statusMessage: responseHeaders.statusMessage ?? context.statusMessage,
      alertMessage: responseHeaders.alertMessage ?? context.alertMessage
    };
    if (headerDetail.redirect) {
      window.location.assign(expandURL(headerDetail.redirect).href);
      return {
        ok: true,
        rendered: false,
        status,
        redirected: headerDetail.redirect,
        url: headerDetail.redirect,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating
      };
    }
    if (headerDetail.reload) {
      window.location.reload();
      return {
        ok: true,
        rendered: false,
        status,
        reloaded: true,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating
      };
    }
    if (headerDetail.title)
      document.title = headerDetail.title;
    if (headerDetail.location) {
      if (headerDetail.events?.length) {
        emitScopeEvents(this, headerDetail.events, {
          source: context.source || this.id || null,
          target: this.id || null,
          status,
          url: context.requestUrl
        });
      }
      const redirected = await this.loadURL(headerDetail.location, { method: "GET" }, {
        ...context,
        statusMessage: headerDetail.statusMessage,
        alertMessage: headerDetail.alertMessage
      });
      return { ...redirected, redirected: headerDetail.location };
    }
    if (status === 204 || status === 205 || status === 304) {
      announce(this, headerDetail);
      const noSwapDetail = {
        ok,
        rendered: false,
        unchanged: status !== 205,
        reset: status === 205,
        status,
        url: response.url || context.requestUrl,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating,
        statusMessage: headerDetail.statusMessage,
        alertMessage: headerDetail.alertMessage,
        events: headerDetail.events
      };
      emitScopeEvents(this, headerDetail.events, {
        source: context.source || this.id || null,
        target: this.id || null,
        status,
        url: noSwapDetail.url
      });
      return noSwapDetail;
    }
    if (!config.renderableResponse(response)) {
      announce(this, headerDetail);
      throw new TypeError(`Refused to render non-HTML response from ${response.url || context.requestUrl}`);
    }
    await assets.loadStyles(headerDetail.styles, context.signal);
    await assets.loadScripts(headerDetail.scripts, context.signal);
    throwIfAborted(context.signal);
    const text = await response.text();
    throwIfAborted(context.signal);
    const parsed = parseHTML(text);
    const select = headerDetail.select || context.select || this.getAttribute("select");
    const target = headerDetail.target || context.target;
    if (target && target !== "_self" && target !== this.id) {
      const targetScope = document.getElementById(target);
      if (!(targetScope instanceof Scope))
        throw new Error(`Target scope not found: ${target}`);
      const operationId = targetScope.#claimOperation();
      setBusy(targetScope, true);
      setRevalidating(targetScope, Boolean(context.revalidating));
      try {
        const result = await targetScope.processParsedResponse(parsed, response, {
          ...context,
          ...headerDetail,
          select,
          source: this.id || null,
          target: targetScope.id,
          operationId
        });
        if (!targetScope.#isCurrentOperation(operationId)) {
          return {
            ...result,
            ok: false,
            aborted: true,
            stale: true,
            source: this.id || null,
            target: targetScope.id
          };
        }
        await targetScope.afterLoad(result);
        return { ...result, source: this.id || null, target: targetScope.id };
      } catch (error) {
        const aborted = error?.name === "AbortError" || context.signal?.aborted;
        const result = {
          ok: false,
          rendered: false,
          error,
          aborted,
          status,
          userInitiated: context.userInitiated,
          revalidating: context.revalidating,
          source: this.id || null,
          target: targetScope.id
        };
        if (!targetScope.#isCurrentOperation(operationId)) {
          return { ...result, stale: true };
        }
        if (aborted) {
          setBusy(targetScope, false);
          setRevalidating(targetScope, false);
          targetScope.#activeOperation = null;
        } else {
          targetScope.dispatchEvent(new CustomEvent("scope:error", eventDetail(result)));
          await targetScope.afterLoad(result);
        }
        throw error;
      }
    }
    return this.processParsedResponse(parsed, response, {
      ...context,
      ...headerDetail,
      select,
      source: context.source || this.id || null,
      target: this.id || null
    });
  }
  async processParsedResponse(parsed, response, context = {}) {
    const operationId = context.operationId ?? this.#activeOperation;
    this.#assertOperation(operationId, context.signal);
    const replacement = this.selectReplacement(parsed, context.select);
    const status = response.status;
    if (!replacement)
      throw new Error(`No replacement found for scope ${this.id || "(anonymous)"}`);
    const beforeSwap = new CustomEvent("scope:before-swap", {
      bubbles: true,
      cancelable: true,
      detail: {
        response,
        replacement,
        status,
        source: context.source || this.id || null,
        target: context.target || this.id || null
      }
    });
    this.dispatchEvent(beforeSwap);
    if (beforeSwap.defaultPrevented) {
      return {
        ok: response.ok,
        rendered: false,
        aborted: true,
        status,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating
      };
    }
    this.#assertOperation(operationId, context.signal);
    const scrollMode = enumOption(context.scroll || getConfig().scroll, ["top", "keep", "none", "hash"], "top", "scroll");
    const restoreScroll = scrollMode === "keep" ? saveScrollPositions(this) : null;
    const fragment = createReplacementFragment(this, replacement.html);
    resolveFragmentURLs(fragment, response.url || context.requestUrl);
    const swapSelector = this.getAttribute("scope-swap");
    if (swapSelector) {
      const target = this.querySelector(swapSelector);
      if (!target) {
        throw new Error(`scope-swap target not found: "${swapSelector}" in scope ${this.id || "(anonymous)"}`);
      }
      if (fragment.childElementCount !== 1) {
        throw new Error(`scope-swap response must contain exactly one root element for "${swapSelector}" in scope ${this.id || "(anonymous)"}, got ${fragment.childElementCount}`);
      }
      const incoming = fragment.firstElementChild;
      this.#assertOperation(operationId, context.signal);
      await assets.loadRegisteredComponents(incoming, context.signal);
      this.#assertOperation(operationId, context.signal);
      const active = document.activeElement;
      const preserveFocus = active instanceof Element && active !== document.body && this.contains(active) && !target.contains(active);
      const releaseHeight = holdMinHeight(this);
      target.replaceWith(incoming);
      setTimeout(() => {
        releaseHeight();
      }, 0);
      const detail = {
        ok: response.ok,
        rendered: true,
        status,
        url: response.url || context.requestUrl,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating,
        statusMessage: context.statusMessage,
        alertMessage: context.alertMessage,
        events: context.events || [],
        focus: context.focus,
        scroll: context.scroll,
        source: context.source || this.id || null,
        target: context.target || this.id || null
      };
      this.dispatchEvent(new CustomEvent("scope:after-swap", eventDetail(detail)));
      if (!preserveFocus)
        focusAfterSwap(this, detail);
      if (restoreScroll)
        restoreScroll();
      else
        scrollScope(this, scrollMode, detail.url);
      announce(this, detail);
      emitScopeEvents(this, context.events, {
        source: detail.source,
        target: detail.target,
        status,
        url: detail.url
      });
      return detail;
    }
    const serverSnapshots = snapshotKeptElements(this, fragment);
    await assets.loadRegisteredComponents(fragment, context.signal);
    this.#assertOperation(operationId, context.signal);
    if (replacement.scope)
      copyScopeAttributes(this, replacement.scope);
    const releaseHeight = holdMinHeight(this);
    replaceChildren(this, fragment, swapKeptChildren);
    setTimeout(() => {
      releaseHeight();
    }, 0);
    rememberServerSnapshots(this, serverSnapshots);
    rememberKeptElements(this);
    if (parsed.isFullDocument && parsed.root instanceof Document) {
      const title = parsed.root.querySelector("title")?.textContent?.trim();
      if (title && !context.title)
        document.title = title;
      if (getConfig().syncDocumentAttributes) {
        copyDocumentAttributes(parsed.root);
        copyBodyAttributes(parsed.root.body);
      }
    }
    const detail = {
      ok: response.ok,
      rendered: true,
      status,
      url: response.url || context.requestUrl,
      userInitiated: context.userInitiated,
      revalidating: context.revalidating,
      statusMessage: context.statusMessage,
      alertMessage: context.alertMessage,
      events: context.events || [],
      focus: context.focus,
      scroll: context.scroll,
      source: context.source || this.id || null,
      target: context.target || this.id || null
    };
    this.dispatchEvent(new CustomEvent("scope:after-swap", eventDetail(detail)));
    focusAfterSwap(this, detail);
    if (restoreScroll)
      restoreScroll();
    else
      scrollScope(this, scrollMode, detail.url);
    announce(this, detail);
    emitScopeEvents(this, context.events, {
      source: detail.source,
      target: detail.target,
      status,
      url: detail.url
    });
    return detail;
  }
  readHeaders(response) {
    const { headers } = getConfig();
    return {
      location: response.headers.get(headers.location),
      redirect: response.headers.get(headers.redirect),
      reload: parseBool(response.headers.get(headers.reload), false),
      title: decodeHeader(response.headers.get(headers.title)),
      statusMessage: decodeHeader(response.headers.get(headers.status)),
      alertMessage: decodeHeader(response.headers.get(headers.alert)),
      scripts: splitHeader(response.headers.get(headers.script)),
      styles: splitHeader(response.headers.get(headers.style)),
      select: response.headers.get(headers.select),
      target: response.headers.get(headers.target),
      events: splitHeader(response.headers.get(headers.event))
    };
  }
  selectReplacement(parsed, select = null) {
    const root = parsed.root;
    if (select) {
      const selected = root.querySelector?.(select);
      if (selected) {
        return {
          scope: selected.localName === "sco-pe" ? selected : null,
          html: selected.innerHTML
        };
      }
    }
    if (this.id) {
      const scope = root.querySelector?.(`sco-pe#${CSS.escape(this.id)}`);
      if (scope) {
        const swapSelector = this.getAttribute("scope-swap");
        const swapTarget = swapSelector ? scope.querySelector(swapSelector) : null;
        return { scope, html: swapTarget ? swapTarget.outerHTML : scope.innerHTML };
      }
    }
    const firstScope = root.querySelector?.("sco-pe");
    if (!this.id && firstScope)
      return { scope: firstScope, html: firstScope.innerHTML };
    if (this.id && firstScope)
      return null;
    if (parsed.isFullDocument && root instanceof Document && root.body) {
      return { scope: null, html: root.body.innerHTML };
    }
    return { scope: null, html: fragmentToHTML(root) };
  }
  async afterLoad(result) {
    setBusy(this, false);
    setRevalidating(this, false);
    this.classList.add("scope-loaded");
    this.markActiveLinks();
    const detail = { scope: this, ...result };
    this.dispatchEvent(new CustomEvent("scope:load", eventDetail(detail)));
    await getConfig().afterLoad(this, detail);
    if (!detail.source || detail.source === this.id) {
      await getConfig().onLoad(this, detail);
    }
  }
  shouldUseHistory() {
    if (!this.id)
      return false;
    if (this.hasAttribute("history"))
      return parseBool(this.getAttribute("history"), true);
    return true;
  }
  updateHistory(url, select = null, { replace = false } = {}) {
    const previous = history.state && typeof history.state === "object" ? history.state : {};
    if (previous.scope && sameHistoryURL(previous.scope.url, url))
      return;
    if (!previous.scope) {
      history.replaceState({
        ...previous,
        scope: { id: this.id, url: window.location.href, select: null }
      }, "", window.location.href);
    }
    const state = { ...previous, scope: { id: this.id, url, select } };
    if (replace)
      history.replaceState(state, "", url);
    else
      history.pushState(state, "", url);
  }
  clearActiveLinks() {
    this.querySelectorAll(`.${CSS.escape(getConfig().activeClass)}`).forEach((el) => {
      if (el.closest("sco-pe") !== this)
        return;
      el.classList.remove(getConfig().activeClass);
      el.removeAttribute("aria-current");
    });
  }
  markActiveLinks(url = window.location.href) {
    const current = stripHash(url || window.location.href);
    let matched = false;
    this.querySelectorAll("a[href]").forEach((link) => {
      if (link.closest("sco-pe") !== this)
        return;
      if (isSameDocumentAnchor(link.href))
        return;
      const active = stripHash(link.href) === current;
      if (active && !matched) {
        this.clearActiveLinks();
        matched = true;
      }
      link.classList.toggle(getConfig().activeClass, active);
      if (active)
        link.setAttribute("aria-current", "page");
      else
        link.removeAttribute("aria-current");
    });
  }
}
window.addEventListener("popstate", (event) => {
  const state = event.state?.scope;
  if (!state?.id || !state.url) {
    if (window.location.hash && focusHashTarget(document, window.location.href))
      return;
    window.location.replace(window.location.href);
    return;
  }
  const scope = document.getElementById(state.id);
  if (scope instanceof Scope) {
    scope.loadURL(state.url, { method: "GET" }, { userInitiated: true, select: state.select }).then((result) => {
      if (!result.rendered && !result.ok && !result.aborted && !result.stale) {
        window.location.replace(window.location.href);
      }
    });
  } else {
    window.location.replace(window.location.href);
  }
});

// sco-pe.js
if (!customElements.get("sco-pe")) {
  customElements.define("sco-pe", Scope);
}
var sco_pe_default = Scope;
export {
  sco_pe_default as default
};
