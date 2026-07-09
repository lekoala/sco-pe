export function parseHTML(html) {
  const isFullDocument =
    /<!doctype\s+html[\s>]/i.test(html) || /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html);

  if (isFullDocument) {
    return {
      isFullDocument: true,
      root: new DOMParser().parseFromString(html, "text/html"),
    };
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  return {
    isFullDocument: false,
    root: template.content,
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

/** Returns whether an element participates in the normal tab order. */
export function isNaturallyFocusable(el) {
  return /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.hasAttribute("tabindex");
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

export function copyScopeAttributes(currentScope, nextScope) {
  if (!nextScope) return;

  const keep = new Set(["id"]);
  const oldNames = currentScope.getAttributeNames();
  for (const name of oldNames) {
    if (!keep.has(name) && !nextScope.hasAttribute(name)) {
      currentScope.removeAttribute(name);
    }
  }

  for (const attr of nextScope.attributes) {
    if (!keep.has(attr.name)) {
      currentScope.setAttribute(attr.name, attr.value);
    }
  }
}
