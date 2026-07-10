function stripFragmentAssets(root) {
  root.querySelectorAll?.('script, style, link[rel~="stylesheet" i]').forEach((asset) => {
    asset.remove();
  });
  return root;
}

export function parseHTML(html) {
  const isFullDocument =
    /<!doctype\s+html[\s>]/i.test(html) || /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html);

  if (isFullDocument) {
    return {
      isFullDocument: true,
      root: stripFragmentAssets(new DOMParser().parseFromString(html, "text/html")),
    };
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  return {
    isFullDocument: false,
    root: stripFragmentAssets(template.content),
  };
}

export function isNodeEmpty(node) {
  return node.textContent.trim() === "" && !node.firstElementChild;
}

export function fragmentToHTML(fragment) {
  const div = document.createElement("div");
  div.appendChild(fragment.cloneNode(true));
  return div.innerHTML;
}

/** Returns whether an element can be focused without adding tabindex. */
export function isNaturallyFocusable(el) {
  if (!(el instanceof HTMLElement) || el.hidden || el.hasAttribute("inert")) return false;
  if (el.hasAttribute("tabindex")) return true;
  if (el.matches("button, input, select, textarea")) {
    return !el.disabled && !el.matches('input[type="hidden"]');
  }
  return el.matches("a[href], area[href], iframe, object, embed, summary, [contenteditable]");
}

export function copyDocumentAttributes(doc) {
  if (!(doc instanceof Document)) return;

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

export function copyBodyAttributes(body) {
  if (!body) return;

  for (const attr of ["class", "style"]) {
    const value = body.getAttribute(attr);
    if (value === null) {
      document.body.removeAttribute(attr);
    } else {
      document.body.setAttribute(attr, value);
    }
  }
}

const STATE_CLASSES = new Set(["scope-loaded", "is-busy", "is-revalidating", "is-transitioning"]);
const serverClassTokens = new WeakMap();
const SYNCED_SCOPE_ATTRIBUTES = new Set([
  "class",
  "role",
  "title",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-live",
  "aria-atomic",
]);

function mergeClassAttribute(currentScope, value) {
  const previousServer = serverClassTokens.get(currentScope) || new Set();
  const client = new Set(
    [...currentScope.classList].filter(
      (token) => !STATE_CLASSES.has(token) && !previousServer.has(token),
    ),
  );
  const nextServer = new Set(
    String(value || "")
      .split(/\s+/)
      .filter(Boolean),
  );
  const next = new Set([...client, ...nextServer]);
  for (const token of currentScope.classList) {
    if (STATE_CLASSES.has(token)) next.add(token);
  }
  serverClassTokens.set(currentScope, nextServer);
  currentScope.setAttribute("class", [...next].join(" "));
}

export function copyScopeAttributes(currentScope, nextScope) {
  if (!nextScope) return;

  // Scope behavior is configured on the existing custom element. A partial
  // response may decorate the scope wrapper, but omission must not remove
  // client-owned attributes such as src, history, scroll, focus, autosubmit,
  // keep, transition or target.
  for (const attr of nextScope.attributes) {
    if (!SYNCED_SCOPE_ATTRIBUTES.has(attr.name)) continue;
    if (attr.name === "class") mergeClassAttribute(currentScope, attr.value);
    else currentScope.setAttribute(attr.name, attr.value);
  }

  if (!nextScope.hasAttribute("class")) mergeClassAttribute(currentScope, "");
}
