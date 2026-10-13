export function expandURL(value, base = document.baseURI) {
  const href = value == null ? "#" : String(value);
  return new URL(href, base);
}

// `fetch` drops the fragment, so a response URL never carries the hash of the
// requested URL. Reattach it for history entries and `scroll="hash"`.
export function withHash(value, hash) {
  const url = expandURL(value);
  if (!hash || url.hash) return url.href;
  url.hash = hash;
  return url.href;
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
  if (value == null) return false;
  const raw = String(value);
  if (!raw.includes("#")) return false;

  const url = expandURL(raw);
  const here = new URL(window.location.href);
  url.hash = "";
  here.hash = "";
  return url.href === here.href;
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

export function decodeHeader(value) {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
