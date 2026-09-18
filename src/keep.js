import { enumOption } from "./config.js";

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
  if (enumOption(scope.getAttribute("keep"), ["none", "same-html"], "none", "keep") !== "same-html")
    return false;
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

function syncFormState(current, next) {
  if (current instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    if (current.type !== "file") current.value = next.value;
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
  // Newly inserted nodes are already the desired server nodes. Re-processing
  // the same object would recurse into its own children indefinitely.
  if (current === next) return current;

  if (shouldKeep(scope, current, next)) return current;

  if (current.nodeType !== next.nodeType) {
    current.replaceWith(next);
    return next;
  }

  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
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
  if (typeof parent.moveBefore === "function") parent.moveBefore(node, reference);
  else parent.insertBefore(node, reference);
}

function keyedIds(nodes) {
  return new Set(nodes.filter((node) => node instanceof Element && node.id).map((node) => node.id));
}

function morphChildren(scope, currentParent, nextParent) {
  const nextNodes = [...nextParent.childNodes];
  let cursor = currentParent.firstChild;

  for (let index = 0; index < nextNodes.length; index += 1) {
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
            const neededLater =
              skipped instanceof Element && skipped.id && laterIds.has(skipped.id);
            if (!neededLater) skipped.remove();
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
      // Do not consume a keyed node for an unkeyed server node. Insert the
      // unkeyed node before it so a later keyed node can still be moved/reused.
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

export function rememberKeptElements(scope) {
  const mode = enumOption(scope.getAttribute("keep"), ["none", "same-html"], "none", "keep");
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
  if (
    enumOption(scope.getAttribute("keep"), ["none", "same-html"], "none", "keep") === "same-html"
  ) {
    morphChildren(scope, scope, fragment);
  } else {
    scope.replaceChildren(fragment);
  }
}
