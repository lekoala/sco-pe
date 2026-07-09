const snapshots = new WeakMap();

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
  if (selector) return [...(root.querySelectorAll?.(selector) || [])];
  return [...(root.querySelectorAll?.("[id]") || [])].filter(defaultCandidate);
}

function shouldKeep(scope, current, next) {
  if (!(current instanceof Element) || !(next instanceof Element)) return false;
  if ((scope.getAttribute("keep") || "none") !== "same-html") return false;
  if (!current.id || current.id !== next.id) return false;
  if (!selectorMatches(scope, current)) return false;

  const currentHTML = snapshots.get(current) || current.outerHTML;
  return currentHTML === next.outerHTML;
}

function sameElement(current, next) {
  if (!(current instanceof Element) || !(next instanceof Element)) return false;
  if (current.localName !== next.localName) return false;
  if (current.id || next.id) return current.id === next.id;
  return true;
}

function syncAttributes(current, next) {
  for (const attr of [...current.attributes]) {
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  }
  for (const attr of [...next.attributes]) {
    if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  }
}

function morphNode(scope, current, next) {
  if (shouldKeep(scope, current, next)) return;

  if (current.nodeType !== next.nodeType) {
    current.replaceWith(next);
    return;
  }

  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }

  if (!sameElement(current, next)) {
    current.replaceWith(next);
    return;
  }

  if (isCustomElement(current)) {
    current.replaceWith(next);
    return;
  }

  syncAttributes(current, next);
  morphChildren(scope, current, next);
}

function morphChildren(scope, currentParent, nextParent) {
  const nextNodes = [...nextParent.childNodes];
  let current = currentParent.firstChild;

  for (const next of nextNodes) {
    if (next instanceof Element && next.id) {
      const children = [...currentParent.childNodes];
      const matching = children
        .slice(current ? children.indexOf(current) : children.length)
        .find((node) => node instanceof Element && node.id === next.id);
      if (matching) {
        while (current && current !== matching) {
          const following = current.nextSibling;
          current.remove();
          current = following;
        }
      }
    }

    if (!current) {
      currentParent.appendChild(next);
      continue;
    }

    const following = current.nextSibling;
    morphNode(scope, current, next);
    current = following;
  }

  while (current) {
    const following = current.nextSibling;
    current.remove();
    current = following;
  }
}

export function rememberKeptElements(scope) {
  const mode = scope.getAttribute("keep") || "none";
  if (mode === "none") return;

  const selector = scope.getAttribute("keep-selector");
  for (const el of candidates(scope, selector)) {
    if (!el.id) continue;
    if (!snapshots.has(el)) snapshots.set(el, el.outerHTML);
  }
}

/** Captures server markup before a swap connects custom elements. */
export function snapshotKeptElements(scope, root) {
  const selector = scope.getAttribute("keep-selector");
  return candidates(root, selector)
    .filter((el) => selectorMatches(scope, el) && el.id)
    .map((el) => ({ id: el.id, html: el.outerHTML }));
}

export function rememberServerSnapshots(scope, snapshotsFromServer) {
  for (const { id, html } of snapshotsFromServer) {
    const el = scope.querySelector(`#${CSS.escape(id)}`);
    if (el) snapshots.set(el, html);
  }
}

export function createReplacementFragment(_scope, html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

export function swapKeptChildren(scope, fragment) {
  if ((scope.getAttribute("keep") || "none") === "same-html") {
    morphChildren(scope, scope, fragment);
  } else {
    scope.replaceChildren(fragment);
  }
}
