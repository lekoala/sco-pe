/**
 * @typedef {Function} PromiseHandler
 * @returns {Promise}
 */

/**
 * @typedef ScopeConfig
 * @property {Boolean} debug
 * @property {Number} debounceTime
 * @property {String} activeClass
 * @property {String} reloadHeader
 * @property {String} titleHeader
 * @property {String} styleHeader
 * @property {String} scriptHeader
 * @property {PromiseHandler} confirmHandler
 * @property {String} statusHeader
 * @property {Function} statusHandler
 * @property {Function} onLoad
 */
let config = {
  debug: false,
  debounceTime: 300,
  activeClass: "active",
  reloadHeader: "X-Reload",
  titleHeader: "X-Title",
  cssHeader: "x-include-css",
  jsHeader: "x-include-js",
  confirmHandler: (message) => {
    return new Promise((resolve, reject) => {
      if (confirm(message)) {
        resolve();
      } else {
        reject();
      }
    });
  },
  statusHeader: "X-Status",
  statusHandler: (message, statusCode) => {
    alert(message);
  },
  onLoad: (scope) => {},
};

/**
 * @type {AbortController}
 */
let globalAbortController = null;

/**
 * @param {HTMLElement} el
 * @returns {Array}
 */
function getEvents(el) {
  if (el instanceof HTMLFormElement) {
    return ["submit"];
  }
  const ev = el.dataset.scopeOn || "click";
  return ev.split(",");
}

/**
 * @param {HTMLElement} el
 * @returns {String}
 */
function getAction(el) {
  return (
    el.getAttribute("action") ||
    el.dataset.scopeAction ||
    el.getAttribute("href")
  );
}

/**
 * @param {Function} func
 * @param {number} timeout
 * @returns {Function}
 */
function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      //@ts-ignore
      func.apply(this, args);
    }, timeout);
  };
}

/**
 * @param {*} v
 * @returns {Boolean}
 */
function parseBool(v) {
  return ["1", "true", true, 1].includes(v);
}

/**
 * @param {HTMLElement} el
 * @param {HTMLElement} parentScope
 * @returns {Boolean}
 */
function getHistory(el, parentScope = null) {
  let history = "true";
  if (el.dataset.scopeHistory) {
    history = el.dataset.scopeHistory;
  } else if (parentScope && parentScope.dataset.history) {
    history = parentScope.dataset.history;
  }
  return parseBool(history);
}

/**
 * @param {String} html
 * @return {Document}
 */
function htmlToDocument(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

/**
 * @param {Element} node
 * @returns {Boolean}
 */
function isNodeEmpty(node) {
  return node.textContent.trim() === "" && !node.firstElementChild;
}

/**
 * @param {String|URL} url
 * @returns {URL}
 */
function expandURL(url) {
  return new URL(url.toString(), document.baseURI);
}

/**
 * @param {String|URL} url
 * @returns {Boolean}
 */
function isExternalURL(url) {
  return expandURL(url).origin !== location.origin;
}

/**
 * @param {URL} url
 * @returns {String}
 */
function getAnchor(url) {
  let anchorMatch;
  if (url.hash) {
    return url.hash.slice(1);
  } else if ((anchorMatch = url.href.match(/#(.*)$/))) {
    return anchorMatch[1];
  }
  return null;
}

/**
 * @param {String|URL} url
 * @returns {Boolean}
 */
function isAnchorURL(url) {
  return getAnchor(expandURL(url)) !== null;
}

/**
 * @param {String} str
 * @returns {String}
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32bit integer
  }
  return new Uint32Array([hash])[0].toString(36);
}

/**
 * @param {String} message
 */
function log(message) {
  if (config.debug) {
    console.log(`[sco-pe] ${message}`);
  }
}

// Make a full page load on back
window.addEventListener("popstate", (event) => {
  if (!event.state) {
    return;
  }
  const id = event.state.id || null;
  if (!id) {
    return;
  }
  /**
   * @type {Scope}
   */
  const scope = document.querySelector(`sco-pe[id="${id}"]`);
  if (!scope) {
    return;
  }
  log(`Restore location from history`);
  scope.loadURL(document.location.toString());
});

class Scope extends HTMLElement {
  constructor() {
    super();

    /**
     * @type {AbortController}
     */
    this.abortController = null;
    /**
     * @type {Boolean}
     */
    this.init = false;
    /**
     * @type {Array}
     */
    this.events = ["click", "submit"];
    /**
     * @type {Function}
     */
    this.loadFunc = debounce((trigger) => {
      this.load(trigger);
    }, config.debounceTime);
  }

  /**
   * @param {ScopeConfig|Object} data
   */
  static configure(data) {
    config = Object.assign(config, data);
  }

  handleEvent(ev) {
    // Check for nested scope
    if (ev.target.closest("sco-pe") !== this) {
      return;
    }

    // Don't handle events if disabled
    if (parseBool(this.dataset.disabled)) {
      return;
    }

    /**
     * @type {HTMLElement}
     */
    let trigger = ev.target.closest("a,button,[data-scope-action]");

    if (ev.type === "submit") {
      trigger = ev.target;
    }

    if (trigger) {
      const events = getEvents(trigger);
      // Ignore events that we don't watch
      if (!events.includes(ev.type)) {
        return;
      }
      const action = getAction(trigger);
      // Ignore empty, external and anchors links
      if (!action || isExternalURL(action) || isAnchorURL(action)) {
        return;
      }
      log(`Handling ${ev.type} on ${trigger.nodeName}`);
      ev.preventDefault();

      const load = () => {
        // For click, no debounce
        if (ev.type === "click") {
          this.load(trigger);
        } else {
          this.loadFunc(trigger);
        }
      };
      // Check confirm ?
      if (trigger.dataset.scopeConfirm) {
        config
          .confirmHandler(trigger.dataset.scopeConfirm)
          .then(load)
          .catch((err) => null);
      } else {
        load();
      }
    }
  }

  abortLoading() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * @param {HTMLElement} el
   */
  async load(el) {
    // Build url
    let action = getAction(el);
    let url = new URL(action, window.location.href).href; // make absolute
    let fullUrl = url;
    // Update history for links for named scopes
    const isLink = el.nodeName === "A";
    let pushToHistory =
      isLink && getHistory(el, this) && this.hasAttribute("id");
    // Pass along current query string and params for elements with value
    const searchParams = new URLSearchParams(window.location.search);
    //@ts-ignore
    const elValue = el.value !== "undefined" ? el.value : el.dataset.scopeValue;
    if (typeof elValue !== "undefined") {
      searchParams.set("value", elValue);
      fullUrl = `${url}?${searchParams.toString()}`;
      pushToHistory = false;
    }

    // Do we target a specific scope ?
    // Always use GET request for sco-pe requests and delegate loading to instance
    const target = el.dataset.scopeTarget || this.dataset.target;
    if (target && target !== "_self") {
      log(`Loading partial document into scope ${target}`);
      document.getElementById(target).setAttribute("src", fullUrl);
      return;
    }

    if (pushToHistory) {
      const id = this.getAttribute("id");
      const state = {
        id,
        url,
      };
      history.pushState(state, null, url);
    }
    if (isLink) {
      this.querySelectorAll(`.${config.activeClass}`).forEach((el) => {
        el.classList.remove(config.activeClass);
      });
      el.classList.add(config.activeClass);
    }
    const method = el.dataset.scopeMethod || "GET";
    if (method === "GET") {
      url = fullUrl;
    }
    const body = method === "POST" ? searchParams : null;
    await this.loadURL(url, {
      method,
      body,
    });
  }

  /**
   * @param {String} url
   * @param {Object} fetchOptions
   */
  async loadURL(url, fetchOptions = {}) {
    if (!fetchOptions.signal) {
      // If not targeting a specific scope, we use a global context
      if (globalAbortController) {
        globalAbortController.abort();
      }
      globalAbortController = new AbortController();
      fetchOptions.signal = globalAbortController.signal;
    }
    const options = Object.assign(
      {
        method: "GET",
      },
      fetchOptions
    );
    const response = await fetch(url, options);
    this.processHeaders(response);
    const data = await response.text();
    this.processResponse(data);
  }

  /**
   * @param {Response} response
   */
  processHeaders(response) {
    if (config.statusHeader) {
      const status = response.headers.get(config.statusHeader);
      if (status) {
        config.statusHandler(status, response.status);
      }
    }
    if (config.titleHeader) {
      const title = response.headers.get(config.titleHeader);
      if (title) {
        document.title = title;
      }
    }
    if (config.reloadHeader) {
      const reload = response.headers.get(config.reloadHeader);
      if (reload) {
        window.location.reload();
      }
    }
    if (config.jsHeader) {
      const js = response.headers.get(config.jsHeader);
      if (js) {
        js.split(",").forEach((src) => {
          this._loadScript(src);
        });
      }
    }
    if (config.cssHeader) {
      const css = response.headers.get(config.cssHeader);
      if (css) {
        css.split(",").forEach((src) => {
          this._loadStyle(src);
        });
      }
    }
  }

  /**
   * @param {HTMLHeadElement} head
   */
  processHead(head) {
    log(`Process head`);

    // Update title
    const title = head.querySelector("title");
    if (title) {
      document.title = title.textContent;
    }
  }

  _loadScript(src, type = null) {
    if (!type) {
      type = "text/javascript";
    }
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      return;
    }
    log(`Loading script ${src}`);
    const newScript = document.createElement("script");
    newScript.setAttribute("type", type);
    newScript.setAttribute("src", src);
    document.head.appendChild(newScript);
  }

  _loadStyle(href) {
    const existingStyle = document.querySelector(`link[href="${href}"]`);
    if (existingStyle) {
      return;
    }
    log(`Loading style ${href}`);
    const newStyle = document.createElement("link");
    newStyle.setAttribute("rel", "stylesheet");
    newStyle.setAttribute("href", href);
    document.head.appendChild(newStyle);
  }

  processScriptsAndStyles(doc) {
    // Make sure our existing inline scripts & styles have a custom id
    document
      .querySelectorAll("script:not([src]):not([id]),style:not([id])")
      .forEach((el) => {
        const hash = simpleHash(el.innerHTML);
        const id = `${el.nodeName.toLowerCase()}-${hash}`;
        el.setAttribute("id", id);
      });

    // Append new styles and scripts
    doc.querySelectorAll("script").forEach((script) => {
      const src = script.getAttribute("src");
      const type = script.type || "text/javascript";
      if (!src) {
        // Inline scripts are always executed except unless they have an id
        const hash = simpleHash(script.innerHTML);
        const id = script.getAttribute("id") || `script-${hash}`;
        const existingInlineScript = document.querySelector(
          `script[id="${id}"]`
        );
        if (existingInlineScript && script.getAttribute("id")) {
          return;
        }
        log(`Loading inline script`);
        const inlineScript = document.createElement("script");
        inlineScript.setAttribute("type", type);
        inlineScript.setAttribute("id", id);
        inlineScript.innerHTML = script.innerHTML;
        if (existingInlineScript) {
          existingInlineScript.replaceWith(inlineScript);
        } else {
          document.head.appendChild(inlineScript);
        }
      } else {
        this._loadScript(src, type);
      }
    });

    doc.querySelectorAll('style,link[rel="stylesheet"]').forEach((style) => {
      const href = style.getAttribute("href");
      if (!href) {
        // Inline styles get a unique hash based on their content to avoid loading them multiple times
        const hash = simpleHash(style.innerHTML);
        const id = style.getAttribute("id") || `style-${hash}`;
        const existingInlineStyle = document.querySelector(`style[id="${id}"]`);
        if (existingInlineStyle) {
          return;
        }
        log(`Loading inline style`);
        const inlineStyle = document.createElement("style");
        inlineStyle.innerHTML = style.innerHTML;
        inlineStyle.setAttribute("id", id);
        document.head.appendChild(inlineStyle);
      } else {
        this._loadStyle(href);
      }
    });
  }

  /**
   * @param {String} data
   */
  processResponse(data) {
    // The response can be a full html document or a partial document
    const isFull = data.match(/<!doctype\s+html[\s>]/i);

    // It may contain one or more sco-pe to replace
    const containsScope = data.indexOf("<sco-pe") !== -1;

    if (isFull || containsScope) {
      log(`Loading scopes ${isFull ? "(full)" : "(partial)"}`);

      const tmp = htmlToDocument(data);

      const head = tmp.querySelector("head");
      if (head) {
        this.processHead(head);
      }
      this.processScriptsAndStyles(tmp);

      // Replace any matching sco-pe by id
      const scopes = tmp.querySelectorAll("sco-pe");
      scopes.forEach((newScope) => {
        const id = newScope.getAttribute("id");
        if (!id) {
          log(`Scope without id`);
          return;
        }
        if (isNodeEmpty(newScope)) {
          log(`Empty scope for ${id}`);
          return;
        }
        const oldScope = document.getElementById(id);
        if (!oldScope) {
          log(`No matching scope for ${id}`);
          return;
        }
        log(`Replacing ${id}`);
        oldScope.outerHTML = newScope.outerHTML;
        // afterLoad will happen automatically through connectedCallback
      });
    } else {
      log(`Loading partial document into self`);
      this.innerHTML = data;
      this.afterLoad();
    }
  }

  async loadContent(check = false) {
    const src = this.src;
    const preventLoading = check && !isNodeEmpty(this);
    if (src && !preventLoading) {
      this.abortLoading();
      this.abortController = new AbortController();
      await this.loadURL(src, {
        signal: this.abortController.signal,
      });
    }
    this.afterLoad();
  }

  afterLoad() {
    this.listenToEvents();

    this.querySelectorAll(`a`).forEach((a) => {
      const url = expandURL(a.getAttribute("href"));
      if (url.toString() == document.location.href) {
        a.classList.add(config.activeClass);
      }
    });

    config.onLoad(this);
    this.classList.remove("scope-loading");
    this.classList.add("scope-loaded");
  }

  listenToEvents() {
    // Intercept all relevant events
    this.querySelectorAll("[data-scope-on]").forEach(
      /**
       * @param {HTMLElement} el
       */
      (el) => {
        this.events = this.events.concat(getEvents(el));
      }
    );

    this.events.forEach((event) => {
      this.addEventListener(event, this);
    });
  }

  /**
   * @param {String} url
   * @param {Object} fetchOptions
   * @returns {Promise<String>}
   */
  async fetchSelf(url, fetchOptions = {}) {
    this.abortLoading();
    this.abortController = new AbortController();
    const options = Object.assign(
      {
        signal: this.abortController.signal,
      },
      fetchOptions
    );
    const response = await fetch(url, options);
    return await response.text();
  }

  static get observedAttributes() {
    return ["src"];
  }

  set src(v) {
    this.setAttribute("src", v);
  }

  get src() {
    return this.getAttribute("src");
  }

  attributeChangedCallback(attr, oldVal, newVal) {
    if (!this.init) {
      return;
    }
    switch (attr) {
      case "src":
        this.loadContent();
        break;
    }
  }

  connectedCallback() {
    this.classList.add("scope-loading");

    // delay execution until the Event Loop is done and all DOM is parsed
    // @link https://stackoverflow.com/questions/70949141/web-components-accessing-innerhtml-in-connectedcallback/75402874
    setTimeout(() => {
      // content can be provided by server rendering, in this case, don't load
      this.loadContent(true);
      this.init = true;
      log(`Scope created ${this.id}`);
    });
  }

  disconnectedCallback() {
    this.events.forEach((event) => {
      this.removeEventListener(event, this);
    });
  }
}

export default Scope;
