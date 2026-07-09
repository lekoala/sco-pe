export function expandURL(value) {
  const href = value ? String(value) : "#";
  return new URL(href, document.baseURI);
}

export function isSameOrigin(value) {
  return expandURL(value).origin === window.location.origin;
}

export function isExternalURL(value) {
  return value ? !isSameOrigin(value) : false;
}

export function hasExternalTarget(el, attribute = "target") {
  const target = el?.getAttribute?.(attribute);
  return Boolean(target && target.toLowerCase() !== "_self");
}

export function getHash(value) {
  const url = expandURL(value);
  return url.hash ? url.hash.slice(1) : null;
}

export function isSameDocumentAnchor(value) {
  if (!value) return false;
  const url = expandURL(value);
  const here = new URL(window.location.href);
  url.hash = "";
  here.hash = "";
  return Boolean(getHash(value)) && url.href === here.href;
}

export function stripHash(value) {
  const url = expandURL(value);
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

export function splitHeader(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
