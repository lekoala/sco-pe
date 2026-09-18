import { announce, focusAfterSwap, setBusy, setRevalidating } from "./a11y.js";
import { assets } from "./assets.js";
import { configure, getConfig, log } from "./config.js";
import {
  copyBodyAttributes,
  copyDocumentAttributes,
  copyScopeAttributes,
  fragmentToHTML,
  isNodeEmpty,
  parseHTML,
} from "./dom.js";
import {
  createReplacementFragment,
  rememberKeptElements,
  rememberServerSnapshots,
  snapshotKeptElements,
  swapKeptChildren,
} from "./keep.js";
import { focusHashTarget, saveScrollPositions, scrollScope } from "./scroll.js";
import { replaceChildren } from "./transition.js";
import {
  decodeHeader,
  expandURL,
  hasExternalTarget as hasNonSelfTarget,
  isExternalURL,
  isSameDocumentAnchor,
  splitHeader,
  stripHash,
} from "./url.js";

const FORM_FIELD_SELECTOR = "input, select, textarea";

function parseBool(value, fallback = false) {
  if (value == null || value === "") return fallback;
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
  if (!signals.length) return controller.signal;
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

// A dedicated timer gives us a reliable `timedOut()` signal on every engine,
// independently of the error name a browser reports for an aborted fetch.
function createTimeoutSignal(ms) {
  if (!(ms > 0)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("The operation timed out", "TimeoutError"));
  }, ms);
  return {
    signal: controller.signal,
    timedOut: () => controller.signal.aborted,
    dispose: () => clearTimeout(timer),
  };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("The operation was aborted", "AbortError");
}

function numberAttribute(el, name, fallback) {
  if (!el?.hasAttribute?.(name)) return fallback;
  const raw = el.getAttribute(name);
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function scopeOption(name, scope, fallback = null) {
  if (scope?.hasAttribute?.(name)) return scope.getAttribute(name);
  return fallback;
}

function getAction(formOrLink, submitter = null) {
  if (submitter?.hasAttribute?.("formaction")) return submitter.getAttribute("formaction");
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
  return (
    submitter?.getAttribute?.("formenctype") ||
    form.getAttribute("enctype") ||
    "application/x-www-form-urlencoded"
  ).toLowerCase();
}

function hasExternalTarget(el, submitter = null) {
  return hasNonSelfTarget(submitter, "formtarget") || hasNonSelfTarget(el);
}

function shouldIgnore(el, submitter = null) {
  const action = getAction(el, submitter);
  const method = getMethod(el, submitter);
  return (
    !action ||
    method === "DIALOG" ||
    el.matches?.("a[download]") ||
    hasExternalTarget(el, submitter) ||
    isExternalURL(action) ||
    isSameDocumentAnchor(action)
  );
}

function isModifiedClick(event) {
  return (
    event.type === "click" &&
    (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
  );
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
  const params = new URLSearchParams();
  for (const [name, value] of formData) {
    params.append(name, value instanceof File ? value.name : value);
  }
  return params;
}

function plainTextFromFormData(formData) {
  return [...formData]
    .map(([name, value]) => `${name}=${value instanceof File ? value.name : value}`)
    .join("\r\n");
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
  if (!a || !b) return false;
  return stripHash(a) === stripHash(b);
}

function eventDetail(extra = {}) {
  return { bubbles: true, cancelable: false, detail: extra };
}

function isSafeMethod(method) {
  return method === "GET" || method === "HEAD";
}

function isFieldEvent(event) {
  return event.type === "input" || event.type === "change";
}

function isSubmittableField(el) {
  if (!el?.matches?.(FORM_FIELD_SELECTOR)) return false;
  if (el.disabled || !el.name) return false;
  return !["button", "submit", "reset", "file"].includes(el.type);
}

function confirmationMessage(trigger, submitter = null) {
  if (submitter?.hasAttribute?.("data-confirm")) return submitter.getAttribute("data-confirm");
  return trigger.getAttribute?.("data-confirm") ?? null;
}

export default class Scope extends HTMLElement {
  #initialized = false;
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
    if (value == null) this.removeAttribute("src");
    else this.setAttribute("src", value);
  }

  connectedCallback() {
    this.addEventListener("click", this);
    this.addEventListener("submit", this);
    this.addEventListener("input", this);
    this.addEventListener("change", this);

    // A custom element can be moved or temporarily detached. Reconnecting an
    // already initialized scope must not reload its src or run setup twice.
    if (this.#initialized) {
      this.markActiveLinks();
      return;
    }

    queueMicrotask(async () => {
      if (!this.isConnected || this.#initialized) return;
      log(`Scope init ${this.id || "(no id)"}`);
      try {
        await this.loadContent({ checkExisting: true, userInitiated: false });
        this.#initialized = true;
        this.markActiveLinks();
        rememberKeptElements(this);
        log(`Scope ready ${this.id || "(no id)"}`);
      } catch (error) {
        this.#initialized = true;
        const result = {
          ok: false,
          rendered: false,
          error,
          status: 0,
          userInitiated: false,
        };
        this.dispatchEvent(new CustomEvent("scope:error", eventDetail(result)));
        await getConfig().onError(this, result);
        await this.afterLoad(result);
      }
    });
  }

  disconnectedCallback() {
    this.abortLoading();
    clearTimeout(this.#autosubmitTimer);
    this.removeEventListener("click", this);
    this.removeEventListener("submit", this);
    this.removeEventListener("input", this);
    this.removeEventListener("change", this);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.#initialized || oldValue === newValue) return;
    if (name === "src") {
      this.loadContent({ checkExisting: false, userInitiated: false });
    }
  }

  handleEvent(event) {
    if (event.target.closest?.("sco-pe") !== this) return;
    // A listener closer to the trigger may have claimed the event (custom
    // confirmation, another component). Respect that decision.
    if (event.defaultPrevented) return;
    if (this.hasAttribute("disabled") && this.getAttribute("disabled") !== "false") return;
    if (isModifiedClick(event)) return;

    if (isFieldEvent(event) && this.handleAutosubmit(event)) return;

    const trigger = event.type === "submit" ? event.target : findClickTrigger(event);
    if (!trigger) return;

    const submitter = submitterFrom(event);
    const action = getAction(trigger, submitter);

    if (event.type === "click" && isSameDocumentAnchor(action)) {
      setTimeout(() => focusHashTarget(document, action), 0);
      return;
    }

    if (shouldIgnore(trigger, submitter)) return;

    event.preventDefault();
    this.handleNavigation(trigger, event).catch((error) => {
      this.dispatchEvent(new CustomEvent("scope:error", eventDetail({ error })));
    });
  }

  async handleNavigation(trigger, event) {
    const message = confirmationMessage(trigger, submitterFrom(event));
    if (message !== null && !(await getConfig().confirmHandler(message))) return;
    await this.load(trigger, event, { userInitiated: true });
  }

  handleAutosubmit(event) {
    if (!this.hasAttribute("autosubmit")) return false;
    if (event.isComposing) return false;
    const field = event.target;
    if (!isSubmittableField(field)) return false;

    const form = field.form || field.closest?.("form");
    if (!form || !this.contains(form)) return false;
    if (getMethod(form) !== "GET") return false;
    if (shouldIgnore(form)) return false;

    const delay = numberAttribute(this, "autosubmit", getConfig().autosubmitDelay);
    clearTimeout(this.#autosubmitTimer);
    this.#autosubmitTimer = setTimeout(() => {
      // Live filters must not bypass native validation. `checkValidity()` is
      // silent, and a later input event will resubmit once the form is valid.
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
      // An explicit cancel or a disconnect must not leave a queued request that
      // a later, unrelated request could trigger.
      this.#dropPendingRequest();
    }
  }

  // Every DOM-writing operation (a local load or a routed response targeting
  // this scope) claims a token. A newer operation invalidates older ones, so a
  // slow response can never overwrite content that landed in the meantime.
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
    if (!pending) return;
    this.#pendingRequest = null;
    pending.start().then(pending.resolve, pending.reject);
  }

  #dropPendingRequest() {
    const pending = this.#pendingRequest;
    if (!pending) return;
    this.#pendingRequest = null;
    pending.resolve({ ok: false, dropped: true, aborted: true, rendered: false });
  }

  reload(options = {}) {
    const state = history.state?.scope;
    const currentHistoryURL = state?.id === this.id ? state.url : null;
    const url = options.url || currentHistoryURL || this.src || window.location.href;
    return this.loadURL(
      url,
      { method: "GET" },
      {
        userInitiated: Boolean(options.userInitiated),
        revalidating: Boolean(options.revalidate || options.revalidating),
        scroll: options.scroll,
        focus: options.focus,
      },
    );
  }

  revalidate(options = {}) {
    return this.reload({ ...options, revalidate: true });
  }

  async load(trigger, event = null, context = {}) {
    const { url, method, body, headers, submitter } = buildRequest(trigger, event);
    const isLink = trigger.matches?.("a[href]");
    const select = scopeOption("select", this);
    const scroll = scopeOption("scroll", this, getConfig().scroll);
    const focus = scopeOption("focus", this, getConfig().focus);
    const target = scopeOption("target", this);
    const useHistory =
      this.shouldUseHistory() &&
      isSafeMethod(method) &&
      (isLink || trigger instanceof HTMLFormElement);

    const submitterWasDisabled = submitter?.disabled;
    if (submitter) submitter.disabled = true;

    const start = () =>
      this.loadURL(
        url,
        { method, body, headers },
        { ...context, trigger, select, scroll, focus, target },
      );

    // GET keeps replacing the in-flight request. Mutations can opt into `queue`
    // or `drop` so a fetch cancellation never races a server write. Internal
    // continuations (redirects, reloads, popstate) bypass this gate.
    const sync = scopeOption("sync", this, getConfig().sync) || "replace";
    let pending = null;
    if (sync !== "replace" && this.#requestInFlight()) {
      if (sync === "drop") {
        this.dispatchEvent(
          new CustomEvent(
            "scope:sync-dropped",
            eventDetail({ url: expandURL(url).href, method: String(method || "GET") }),
          ),
        );
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
        const activeURL = useHistory
          ? window.location.href
          : isLink
            ? result.url || url
            : undefined;
        this.markActiveLinks(activeURL);
        const targetScope = result.target ? document.getElementById(result.target) : null;
        if (targetScope instanceof Scope && targetScope !== this) {
          targetScope.markActiveLinks(activeURL);
        }
      }

      return result;
    } finally {
      if (submitter) submitter.disabled = Boolean(submitterWasDisabled);
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
    // Capture unupgraded declarative markup before module loading can mutate it.
    rememberKeptElements(this);
    await assets.loadRegisteredComponents(this);
  }

  async loadURL(url, fetchOptions = {}, context = {}) {
    const config = getConfig();
    const absoluteUrl = expandURL(url).href;

    const controller = new AbortController();
    const requestId = ++this.#requestSequence;
    const timeout = numberAttribute(this, "timeout", config.timeout);
    const timeoutHandle = createTimeoutSignal(timeout);

    const options = {
      method: "GET",
      ...fetchOptions,
      headers: mergeRequestHeaders(config.requestHeaders, fetchOptions.headers),
      signal: combineSignals(controller, fetchOptions.signal, timeoutHandle?.signal),
    };

    const before = new CustomEvent("scope:before-load", {
      bubbles: true,
      cancelable: true,
      detail: {
        url: absoluteUrl,
        options,
        trigger: context.trigger || null,
        revalidating: Boolean(context.revalidating),
      },
    });
    this.dispatchEvent(before);
    if (before.defaultPrevented) {
      controller.abort();
      return { ok: false, aborted: true };
    }

    // Only an accepted load supersedes the current request. A canceled
    // navigation must not abort work that is already in flight.
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
        operationId,
      });
      if (this.#activeRequestId === requestId && !result.stale) {
        afterLoadStarted = true;
        await this.afterLoad(result);
      }
      return result;
    } catch (error) {
      const timedOut = timeoutHandle?.timedOut() === true || error?.name === "TimeoutError";
      // A timeout often reaches us as an engine-specific AbortError. Surface it
      // as a real error instead of swallowing it as a quiet cancellation.
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
        revalidating: context.revalidating,
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
        if (this.#isCurrentOperation(operationId)) this.#activeOperation = null;
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
      alertMessage: responseHeaders.alertMessage ?? context.alertMessage,
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
        revalidating: context.revalidating,
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
        revalidating: context.revalidating,
      };
    }

    if (headerDetail.title) document.title = headerDetail.title;

    if (headerDetail.location) {
      const redirected = await this.loadURL(
        headerDetail.location,
        { method: "GET" },
        {
          ...context,
          statusMessage: headerDetail.statusMessage,
          alertMessage: headerDetail.alertMessage,
        },
      );
      return { ...redirected, redirected: headerDetail.location };
    }

    if (status === 204 || status === 205 || status === 304) {
      announce(this, headerDetail);
      return {
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
      };
    }

    if (!config.renderableResponse(response)) {
      announce(this, headerDetail);
      throw new TypeError(
        `Refused to render non-HTML response from ${response.url || context.requestUrl}`,
      );
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
      if (!(targetScope instanceof Scope)) throw new Error(`Target scope not found: ${target}`);

      // A routed response becomes the newest content for the target scope and
      // therefore supersedes any request that target started for itself.
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
          operationId,
        });
        if (!targetScope.#isCurrentOperation(operationId)) {
          return {
            ...result,
            ok: false,
            aborted: true,
            stale: true,
            source: this.id || null,
            target: targetScope.id,
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
          target: targetScope.id,
        };
        // The target moved on while this response was waiting on an asset.
        // Its newer operation owns the DOM and the busy state.
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
      target: this.id || null,
    });
  }

  async processParsedResponse(parsed, response, context = {}) {
    const operationId = context.operationId ?? this.#activeOperation;
    this.#assertOperation(operationId, context.signal);
    const replacement = this.selectReplacement(parsed, context.select);
    const status = response.status;

    if (!replacement) throw new Error(`No replacement found for scope ${this.id || "(anonymous)"}`);

    const beforeSwap = new CustomEvent("scope:before-swap", {
      bubbles: true,
      cancelable: true,
      detail: {
        response,
        replacement,
        status,
        source: context.source || this.id || null,
        target: context.target || this.id || null,
      },
    });
    this.dispatchEvent(beforeSwap);
    if (beforeSwap.defaultPrevented) {
      return {
        ok: response.ok,
        rendered: false,
        aborted: true,
        status,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating,
      };
    }
    this.#assertOperation(operationId, context.signal);

    const scrollMode = context.scroll || getConfig().scroll;
    const restoreScroll = scrollMode === "keep" ? saveScrollPositions(this) : null;

    const fragment = createReplacementFragment(this, replacement.html);

    const swapSelector = this.getAttribute("scope-swap");
    if (swapSelector) {
      const target = this.querySelector(swapSelector);
      const incoming = target ? fragment.firstElementChild : null;
      if (target && incoming) {
        this.#assertOperation(operationId, context.signal);
        await assets.loadRegisteredComponents(incoming, context.signal);
        this.#assertOperation(operationId, context.signal);
        const prevHeight = this.clientHeight;
        this.style.minHeight = `${prevHeight}px`;
        target.replaceWith(incoming);
        setTimeout(() => {
          this.style.minHeight = "";
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
          focus: context.focus,
          scroll: context.scroll,
          source: context.source || this.id || null,
          target: context.target || this.id || null,
        };
        this.dispatchEvent(new CustomEvent("scope:after-swap", eventDetail(detail)));
        focusAfterSwap(this, detail);
        if (restoreScroll) restoreScroll();
        else scrollScope(this, scrollMode, detail.url);
        announce(this, detail);
        return detail;
      }
    }

    const serverSnapshots = snapshotKeptElements(this, fragment);
    await assets.loadRegisteredComponents(fragment, context.signal);
    this.#assertOperation(operationId, context.signal);
    if (replacement.scope) copyScopeAttributes(this, replacement.scope);
    const prevHeight = this.clientHeight;
    this.style.minHeight = `${prevHeight}px`;
    replaceChildren(this, fragment, swapKeptChildren);
    setTimeout(() => {
      this.style.minHeight = "";
    }, 0);
    rememberServerSnapshots(this, serverSnapshots);
    rememberKeptElements(this);

    if (parsed.isFullDocument && parsed.root instanceof Document) {
      const title = parsed.root.querySelector("title")?.textContent?.trim();
      if (title && !context.title) document.title = title;
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
      focus: context.focus,
      scroll: context.scroll,
      source: context.source || this.id || null,
      target: context.target || this.id || null,
    };

    this.dispatchEvent(new CustomEvent("scope:after-swap", eventDetail(detail)));
    focusAfterSwap(this, detail);
    if (restoreScroll) restoreScroll();
    else scrollScope(this, scrollMode, detail.url);
    announce(this, detail);

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
    };
  }

  selectReplacement(parsed, select = null) {
    const root = parsed.root;

    if (select) {
      const selected = root.querySelector?.(select);
      if (selected) {
        return {
          scope: selected.localName === "sco-pe" ? selected : null,
          // Scope-Select extracts the selected element's content, not its wrapper.
          html: selected.innerHTML,
        };
      }
    }

    if (this.id) {
      const scope = root.querySelector?.(`sco-pe#${CSS.escape(this.id)}`);
      if (scope) return { scope, html: scope.innerHTML };
    }

    const firstScope = root.querySelector?.("sco-pe");
    if (!this.id && firstScope) return { scope: firstScope, html: firstScope.innerHTML };
    if (this.id && firstScope) return null;

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
    // Compatibility callback for the request owner. Cross-target responses
    // run afterLoad for both scopes, but onLoad only once on the source scope.
    if (!detail.source || detail.source === this.id) {
      await getConfig().onLoad(this, detail);
    }
  }

  shouldUseHistory() {
    if (!this.id) return false;
    if (this.hasAttribute("history")) return parseBool(this.getAttribute("history"), true);
    return true;
  }

  updateHistory(url, select = null, { replace = false } = {}) {
    // `history.state.scope` is reserved by sco-pe. Every other property belongs
    // to the application and must survive scoped navigation.
    const previous = history.state && typeof history.state === "object" ? history.state : {};
    if (previous.scope && sameHistoryURL(previous.scope.url, url)) return;
    if (!previous.scope) {
      history.replaceState(
        {
          ...previous,
          scope: { id: this.id, url: window.location.href, select: null },
        },
        "",
        window.location.href,
      );
    }
    const state = { ...previous, scope: { id: this.id, url, select } };
    if (replace) history.replaceState(state, "", url);
    else history.pushState(state, "", url);
  }

  clearActiveLinks() {
    this.querySelectorAll(`.${CSS.escape(getConfig().activeClass)}`).forEach((el) => {
      if (el.closest("sco-pe") !== this) return;
      el.classList.remove(getConfig().activeClass);
      el.removeAttribute("aria-current");
    });
  }

  markActiveLinks(url = window.location.href) {
    const current = stripHash(url || window.location.href);
    let matched = false;
    this.querySelectorAll("a[href]").forEach((link) => {
      if (link.closest("sco-pe") !== this) return;
      if (isSameDocumentAnchor(link.href)) return;
      const active = stripHash(link.href) === current;
      if (active && !matched) {
        this.clearActiveLinks();
        matched = true;
      }
      link.classList.toggle(getConfig().activeClass, active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
}

window.addEventListener("popstate", (event) => {
  const state = event.state?.scope;
  if (!state?.id || !state.url) {
    if (window.location.hash && focusHashTarget(document, window.location.href)) return;
    window.location.replace(window.location.href);
    return;
  }

  const scope = document.getElementById(state.id);
  if (scope instanceof Scope) {
    scope
      .loadURL(state.url, { method: "GET" }, { userInitiated: true, select: state.select })
      .then((result) => {
        // If the scoped restoration could not render anything, fall back to
        // the browser so the URL and document cannot remain out of sync.
        if (!result.rendered && !result.ok && !result.aborted && !result.stale) {
          window.location.replace(window.location.href);
        }
      });
  } else {
    window.location.replace(window.location.href);
  }
});
