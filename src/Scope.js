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

function numberAttribute(el, name, fallback) {
  const value = Number(el.getAttribute(name));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function scopeOption(name, scope, fallback = null) {
  if (scope?.hasAttribute?.(name)) return scope.getAttribute(name);
  return fallback;
}

function getAction(formOrLink, submitter = null) {
  if (submitter?.hasAttribute?.("formaction")) return submitter.getAttribute("formaction");
  return formOrLink.getAttribute("action") || formOrLink.getAttribute("href");
}

function getMethod(formOrLink, submitter = null) {
  if (submitter?.hasAttribute?.("formmethod"))
    return submitter.getAttribute("formmethod").toUpperCase();
  return (formOrLink.getAttribute("method") || "GET").toUpperCase();
}

function hasExternalTarget(el, submitter = null) {
  return hasNonSelfTarget(submitter, "formtarget") || hasNonSelfTarget(el);
}

function shouldIgnore(el, submitter = null) {
  const action = getAction(el, submitter);
  return (
    !action ||
    hasExternalTarget(el, submitter) ||
    isExternalURL(action) ||
    isSameDocumentAnchor(action)
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

function buildRequest(trigger, event) {
  const submitter = submitterFrom(event);
  const action = getAction(trigger, submitter);
  const url = expandURL(action);
  const method = getMethod(trigger, submitter);
  let body = null;

  if (trigger instanceof HTMLFormElement) {
    const formData = formDataFor(trigger, submitter);

    if (method === "GET") {
      url.search = new URLSearchParams(formData).toString();
    } else {
      body = formData;
    }
  }

  return { url: url.href, method, body, submitter };
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

    queueMicrotask(async () => {
      log(`Scope init ${this.id || "(no id)"}`);
      await this.loadContent({ checkExisting: true, userInitiated: false });
      this.#initialized = true;
      this.markActiveLinks();
      rememberKeptElements(this);
      log(`Scope ready ${this.id || "(no id)"}`);
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
    if (this.hasAttribute("disabled") && this.getAttribute("disabled") !== "false") return;

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
    const field = event.target;
    if (!isSubmittableField(field)) return false;

    const form = field.form || field.closest?.("form");
    if (!form || !this.contains(form)) return false;
    if (getMethod(form) !== "GET") return false;
    if (!getAction(form)) return false;

    const delay = numberAttribute(this, "autosubmit", getConfig().autosubmitDelay);
    clearTimeout(this.#autosubmitTimer);
    this.#autosubmitTimer = setTimeout(() => {
      this.load(form, null, { userInitiated: true, autosubmit: true }).catch((error) => {
        this.dispatchEvent(new CustomEvent("scope:error", eventDetail({ error })));
      });
    }, delay);
    return true;
  }

  abortLoading() {
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
  }

  reload(options = {}) {
    const url = options.url || this.src || history.state?.scope?.url || window.location.href;
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
    const { url, method, body, submitter } = buildRequest(trigger, event);
    const isLink = trigger.matches?.("a[href]");
    const select = scopeOption("select", this);
    const scroll = scopeOption("scroll", this, getConfig().scroll);
    const focus = scopeOption("focus", this, getConfig().focus);
    const target = scopeOption("target", this);
    const useHistory =
      this.shouldUseHistory() &&
      isSafeMethod(method) &&
      (isLink || trigger instanceof HTMLFormElement);

    if (submitter) submitter.disabled = true;

    try {
      if (target && target !== "_self") {
        const targetScope = document.getElementById(target);
        if (!(targetScope instanceof Scope)) throw new Error(`Target scope not found: ${target}`);
        return await targetScope.loadURL(
          url,
          { method, body },
          { ...context, trigger, select, scroll, focus },
        );
      }

      const result = await this.loadURL(
        url,
        { method, body },
        { ...context, trigger, select, scroll, focus },
      );

      if (useHistory && result.ok && !result.aborted) {
        this.updateHistory(result.url || url, select, { replace: Boolean(context.autosubmit) });
      }

      if (isLink && result.ok && !result.aborted) {
        this.clearActiveLinks();
        trigger.classList.add(getConfig().activeClass);
        this.markActiveLinks();
      }

      return result;
    } finally {
      if (submitter) submitter.disabled = false;
    }
  }

  async loadContent({ checkExisting = false, userInitiated = false } = {}) {
    if (!this.src) {
      await this.prepareExistingContent();
      await this.afterLoad({ ok: true, status: 200, userInitiated });
      return { ok: true };
    }

    if (checkExisting && !isNodeEmpty(this)) {
      await this.prepareExistingContent();
      await this.afterLoad({ ok: true, status: 200, userInitiated });
      return { ok: true };
    }

    return this.loadURL(this.src, { method: "GET" }, { userInitiated });
  }

  async prepareExistingContent() {
    // Capture unupgraded declarative markup before module loading can mutate it.
    rememberKeptElements(this);
    await assets.loadDeclaredAssets(this);
    await assets.loadRegisteredComponents(this);
  }

  async loadURL(url, fetchOptions = {}, context = {}) {
    const config = getConfig();
    const absoluteUrl = expandURL(url).href;
    const controller = new AbortController();

    this.abortLoading();
    this.#abortController = controller;

    const options = {
      method: "GET",
      ...fetchOptions,
      headers: {
        ...config.requestHeaders,
        ...(fetchOptions.headers || {}),
      },
      signal: fetchOptions.signal || controller.signal,
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
    if (before.defaultPrevented) return { ok: false, aborted: true };

    setBusy(this, true);
    setRevalidating(this, Boolean(context.revalidating));
    await config.beforeLoad(this, before.detail);
    log(`${options.method || "GET"} ${absoluteUrl}`);

    try {
      const response = await config.fetch(absoluteUrl, options);
      const result = await this.processResponse(response, { ...context, requestUrl: absoluteUrl });
      await this.afterLoad(result);
      return result;
    } catch (error) {
      const aborted = error?.name === "AbortError";
      const result = {
        ok: false,
        error,
        aborted,
        status: 0,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating,
      };
      if (!aborted) {
        this.dispatchEvent(new CustomEvent("scope:error", eventDetail(result)));
        config.onError(this, result);
      }
      await this.afterLoad(result);
      return result;
    } finally {
      if (this.#abortController === controller) this.#abortController = null;
    }
  }

  async processResponse(response, context = {}) {
    const config = getConfig();
    const status = response.status;
    const ok = response.ok || status === 400 || status === 422;
    const headerDetail = this.readHeaders(response);

    if (headerDetail.redirect) {
      window.location.assign(expandURL(headerDetail.redirect).href);
      return {
        ok: true,
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
        status,
        reloaded: true,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating,
      };
    }

    if (headerDetail.title) document.title = headerDetail.title;

    if (headerDetail.location) {
      const redirected = await this.loadURL(headerDetail.location, { method: "GET" }, context);
      return { ...redirected, redirected: headerDetail.location };
    }

    await assets.loadStyles(headerDetail.styles);
    await assets.loadScripts(headerDetail.scripts);

    if (status === 204 || status === 304) {
      announce(this, headerDetail);
      return {
        ok,
        status,
        url: response.url || context.requestUrl,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating,
      };
    }

    if (!config.renderableResponse(response)) {
      announce(this, headerDetail);
      throw new TypeError(
        `Refused to render non-HTML response from ${response.url || context.requestUrl}`,
      );
    }

    const text = await response.text();
    const parsed = parseHTML(text);

    await assets.loadDeclaredAssets(parsed.root);

    const select = headerDetail.select || context.select || this.getAttribute("select");
    const target = headerDetail.target;
    if (target && target !== this.id) {
      const targetScope = document.getElementById(target);
      if (targetScope instanceof Scope) {
        return targetScope.processParsedResponse(parsed, response, {
          ...context,
          ...headerDetail,
          select,
        });
      }
    }

    return this.processParsedResponse(parsed, response, { ...context, ...headerDetail, select });
  }

  async processParsedResponse(parsed, response, context = {}) {
    const replacement = this.selectReplacement(parsed, context.select);
    const status = response.status;

    if (!replacement) throw new Error(`No replacement found for scope ${this.id || "(anonymous)"}`);

    const beforeSwap = new CustomEvent("scope:before-swap", {
      bubbles: true,
      cancelable: true,
      detail: { response, replacement, status },
    });
    this.dispatchEvent(beforeSwap);
    if (beforeSwap.defaultPrevented) {
      return {
        ok: false,
        aborted: true,
        status,
        userInitiated: context.userInitiated,
        revalidating: context.revalidating,
      };
    }

    const scrollMode = context.scroll || getConfig().scroll;
    const restoreScroll = scrollMode === "keep" ? saveScrollPositions(this) : null;

    if (replacement.scope) copyScopeAttributes(this, replacement.scope);

    const fragment = createReplacementFragment(this, replacement.html);
    const serverSnapshots = snapshotKeptElements(this, fragment);
    await replaceChildren(this, fragment, swapKeptChildren);
    rememberServerSnapshots(this, serverSnapshots);
    rememberKeptElements(this);

    await assets.loadRegisteredComponents(this);

    if (parsed.isFullDocument && parsed.root instanceof Document) {
      const title = parsed.root.querySelector("title")?.textContent?.trim();
      if (title && !context.title) document.title = title;
      copyDocumentAttributes(parsed.root);
      copyBodyAttributes(parsed.root.body);
    }

    const detail = {
      ok: response.ok || status === 400 || status === 422,
      status,
      url: response.url,
      userInitiated: context.userInitiated,
      revalidating: context.revalidating,
      statusMessage: context.statusMessage,
      alertMessage: context.alertMessage,
      focus: context.focus,
      scroll: context.scroll,
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
      reload: response.headers.get(headers.reload),
      title: response.headers.get(headers.title),
      statusMessage: response.headers.get(headers.status),
      alertMessage: response.headers.get(headers.alert),
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
    await getConfig().onLoad(this, detail);
  }

  shouldUseHistory() {
    if (!this.id) return false;
    if (this.hasAttribute("history")) return parseBool(this.getAttribute("history"), true);
    return true;
  }

  updateHistory(url, select = null, { replace = false } = {}) {
    const state = { scope: { id: this.id, url, select } };
    if (history.state?.scope && sameHistoryURL(history.state.scope.url, url)) return;
    if (!history.state?.scope) {
      history.replaceState(
        { scope: { id: this.id, url: window.location.href, select: null } },
        "",
        window.location.href,
      );
    }
    if (replace) history.replaceState(state, "", url);
    else history.pushState(state, "", url);
  }

  clearActiveLinks() {
    this.querySelectorAll(`.${CSS.escape(getConfig().activeClass)}`).forEach((el) => {
      el.classList.remove(getConfig().activeClass);
      el.removeAttribute("aria-current");
    });
  }

  markActiveLinks() {
    const current = stripHash(window.location.href);
    let matched = false;
    this.querySelectorAll("a[href]").forEach((link) => {
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
    scope.loadURL(state.url, { method: "GET" }, { userInitiated: true, select: state.select });
  } else {
    window.location.replace(window.location.href);
  }
});
