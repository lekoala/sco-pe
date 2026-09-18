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
  const mimeType = contentType.split(";", 1)[0].trim().toLowerCase();
  return mimeType === "text/html" || mimeType === "application/xhtml+xml";
}

export const DEFAULT_CONFIG = {
  debug: false,
  activeClass: "active",
  requestHeaders: {
    "Scope-Request": "true",
    Accept: "text/html, application/xhtml+xml;q=0.9",
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
  onError: () => {},
};

export function enumOption(value, allowed, fallback, name = "option") {
  if (value == null || value === "") return fallback;
  if (allowed.includes(value)) return value;
  log(`Unknown ${name} "${value}", falling back to "${fallback}"`);
  return fallback;
}

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
