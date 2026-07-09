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

export class AssetLoader {
  async loadStyles(hrefs = []) {
    await Promise.all(hrefs.map((href) => this.loadStyle(href)));
  }

  async loadScripts(srcs = []) {
    await Promise.all(srcs.map((src) => this.loadModule(src)));
  }

  loadStyle(href) {
    const url = expandURL(href).href;
    assertAllowedAsset(url);

    if (stylePromises.has(url)) {
      return stylePromises.get(url);
    }

    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find(
      (link) => link.href === url,
    );
    if (existing) {
      const promise = existing.sheet
        ? Promise.resolve(existing)
        : new Promise((resolve) => {
            existing.addEventListener("load", () => resolve(existing), { once: true });
            existing.addEventListener("error", () => resolve(existing), { once: true });
          });
      stylePromises.set(url, promise);
      return promise;
    }

    log(`Loading style ${url}`);
    const promise = new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.addEventListener("load", () => resolve(link), { once: true });
      link.addEventListener("error", () => resolve(link), { once: true });
      document.head.appendChild(link);
    });

    stylePromises.set(url, promise);
    return promise;
  }

  loadModule(src) {
    const url = expandURL(src).href;
    assertAllowedAsset(url);

    if (!modulePromises.has(url)) {
      log(`Loading module ${url}`);
      modulePromises.set(url, import(/* @vite-ignore */ url));
    }

    return modulePromises.get(url);
  }

  async loadDeclaredAssets(root) {
    const styles = [];
    const scripts = [];
    const templates = root.querySelectorAll?.("template[scope-assets]") || [];

    templates.forEach((template) => {
      template.content.querySelectorAll('link[rel="stylesheet"][href]').forEach((link) => {
        styles.push(link.getAttribute("href"));
      });

      template.content.querySelectorAll("script[src]").forEach((script) => {
        const type = script.getAttribute("type") || "text/javascript";
        const config = getConfig();
        if (type === "module") {
          scripts.push(script.getAttribute("src"));
        } else if (config.allowClassicScripts) {
          scripts.push(script.getAttribute("src"));
        } else {
          log(`Ignored non-module declared script ${script.getAttribute("src")}`);
        }
      });

      template.remove();
    });

    await this.loadStyles(styles);
    await this.loadScripts(scripts);
  }

  async loadRegisteredComponents(root) {
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
        await this.loadModule(src);
        await customElements.whenDefined(tag);
      }),
    );
  }
}

export const assets = new AssetLoader();
