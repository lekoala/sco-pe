/** @typedef {(scope: HTMLElement, detail: object) => void|Promise<void>} ScopeCallback */

export const DEFAULT_HEADERS = Object.freeze({
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
});

export function defaultRenderableResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return /(^|;)\s*(text\/html|application\/xhtml\+xml)\b/i.test(contentType);
}

export const DEFAULT_CONFIG = {
  debug: false,
  activeClass: "active",
  requestHeaders: {
    "X-Requested-With": "XMLHttpRequest",
    Accept: "text/html, */*;q=0.8",
  },
  headers: DEFAULT_HEADERS,
  statusTarget: null,
  alertTarget: null,
  focus: "auto",
  scroll: "top",
  announce: "auto",
  autosubmitDelay: 300,
  transition: "none",
  transitionTimeout: 250,
  components: {},
  allowExternalAssets: false,
  allowClassicScripts: false,
  renderableResponse: defaultRenderableResponse,
  confirmHandler: (message) => Promise.resolve(window.confirm(message)),
  fetch: (...args) => fetch(...args),
  beforeLoad: () => {},
  afterLoad: () => {},
  onLoad: () => {},
  onError: () => {},
};

let config = { ...DEFAULT_CONFIG, headers: { ...DEFAULT_HEADERS } };

export function getConfig() {
  return config;
}

export function configure(next = {}) {
  config = {
    ...config,
    ...next,
    requestHeaders: {
      ...config.requestHeaders,
      ...(next.requestHeaders || {}),
    },
    headers: {
      ...config.headers,
      ...(next.headers || {}),
    },
    components: {
      ...config.components,
      ...(next.components || {}),
    },
  };
  return config;
}

export function log(message, ...data) {
  if (config.debug) {
    console.log(`[sco-pe] ${message}`, ...data);
  }
}
