import { getConfig, log } from "./config.js";
import { expandURL, isSameOrigin } from "./url.js";

const modulePromises = new Map();
const stylePromises = new Map();

function assertAllowedAsset(url) {
  const config = getConfig();
  if (!config.allowExternalAssets && !isSameOrigin(url)) {
    throw new Error(`External scope asset blocked: ${url}`);
  }
}

function retryable(map, key, load) {
  if (!map.has(key)) {
    const promise = Promise.resolve()
      .then(load)
      .catch((error) => {
        map.delete(key);
        throw error;
      });
    map.set(key, promise);
  }
  return map.get(key);
}

function abortedReason(signal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

// `import()` cannot be cancelled, but the caller can stop waiting for it. The
// cached load keeps running so a later operation reuses the settled module.
function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortedReason(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortedReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export class AssetLoader {
  async loadStyles(hrefs = [], signal) {
    await Promise.all(hrefs.map((href) => abortable(this.loadStyle(href), signal)));
  }

  async loadScripts(srcs = [], signal) {
    await Promise.all(srcs.map((src) => abortable(this.loadModule(src), signal)));
  }

  loadStyle(href) {
    const url = expandURL(href).href;
    assertAllowedAsset(url);

    return retryable(stylePromises, url, () => {
      const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find(
        (link) => link.href === url,
      );
      if (existing?.sheet) return existing;

      log(`Loading style ${url}`);
      const link = existing || document.createElement("link");
      if (!existing) {
        link.rel = "stylesheet";
        link.href = url;
        document.head.appendChild(link);
      }

      return new Promise((resolve, reject) => {
        link.addEventListener("load", () => resolve(link), { once: true });
        link.addEventListener(
          "error",
          () => reject(new Error(`Could not load scope style: ${url}`)),
          { once: true },
        );
      });
    });
  }

  loadModule(src) {
    const url = expandURL(src).href;
    assertAllowedAsset(url);

    return retryable(modulePromises, url, () => {
      log(`Loading module ${url}`);
      return import(/* @vite-ignore */ url);
    });
  }

  async loadRegisteredComponents(root, signal) {
    const config = getConfig();
    const tags = new Set();

    root.querySelectorAll?.("*").forEach((el) => {
      const tag = el.localName;
      if (tag?.includes("-") && tag !== "sco-pe" && !customElements.get(tag)) {
        tags.add(tag);
      }
    });

    await Promise.all(
      [...tags].map(async (tag) => {
        const src = config.components?.[tag];
        if (!src) {
          log(`No registered module for <${tag}>`);
          return;
        }
        await abortable(this.loadModule(src), signal);
        if (!customElements.get(tag)) {
          throw new Error(`Registered module did not define <${tag}>: ${src}`);
        }
      }),
    );
  }
}

export const assets = new AssetLoader();
