import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("./", import.meta.url)));
const port = Number(process.env.PORT || 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function esc(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlDoc(fragment, title) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — sco-pe demo</title>
<link rel="stylesheet" href="/static/demo.css">
<script type="module" src="/sco-pe.js"></script>
</head>
<body>
<nav><a href="/static/index.html">All demos</a></nav>
<div id="scope-status" role="status" aria-live="polite" aria-atomic="true"></div>
<div id="scope-alert" role="alert" aria-atomic="true"></div>
${fragment}
</body>
</html>`;
}

function scope(id, title, extra, attrs = 'history="true"') {
  return `<sco-pe id="${id}" ${attrs}><h1>${esc(title)}</h1>${extra || ""}</sco-pe>`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

function respond(req, res, fragment, title, headers) {
  if (req.headers["scope-request"] === "true") {
    send(res, 200, fragment, headers);
  } else {
    send(res, 200, htmlDoc(fragment, title), headers);
  }
}

async function tryFile(res, filePath) {
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/demo/users" && req.method === "POST") {
    const fragment = scope("main", "User saved", '<p role="status">User created.</p><a href="/demo/users">Back</a>');
    respond(req, res, fragment, "User saved", { "Scope-Status": "User saved" });
    return;
  }

  if (url.pathname === "/demo/users" && url.searchParams.get("page") === "2") {
    const fragment = scope("main", "Users — page 2", '<a href="/demo/users">Previous page</a>');
    respond(req, res, fragment, "Users — page 2", { "Scope-Status": "Page 2 loaded" });
    return;
  }

  if (url.pathname === "/demo/users") {
    const q = url.searchParams.get("q") || "";
    const title = q ? `Search: ${q}` : "Users";
    const fragment = scope("main", title, `
      <nav aria-label="Users"><a href="/demo/users?page=2">Next page</a></nav>
      <form action="/demo/users" method="get">
        <label>Search <input name="q" value="${esc(q)}"></label>
        <button>Search</button>
      </form>
      <form action="/demo/users" method="post" data-confirm="Create this user?">
        <label>Email <input name="email" type="email" required></label>
        <button>Create user</button>
      </form>
    `);
    respond(req, res, fragment, title);
    return;
  }

  if (url.pathname === "/demo/orders") {
    const fragment = scope("orders", "Recent orders", `
      <p>#1042 — awaiting payment</p>
      <a href="/demo/order-1042">Mark #1042 as paid</a>
    `);
    respond(req, res, fragment, "Recent orders");
    return;
  }

  if (url.pathname === "/demo/stats") {
    const fragment = '<sco-pe id="stats" scroll="none"><h1>Today</h1><p>4 orders awaiting payment.</p></sco-pe>';
    respond(req, res, fragment, "Today");
    return;
  }

  if (url.pathname === "/demo/order-1042") {
    const fragment = '<sco-pe id="stats" scroll="none"><h1>Today</h1><p>3 orders awaiting payment.</p></sco-pe>';
    respond(req, res, fragment, "Today", {
      "Scope-Target": "stats",
      "Scope-Status": "Order #1042 marked as paid",
    });
    return;
  }

  if (url.pathname === "/demo/catalog") {
    const q = url.searchParams.get("q") || "";
    const products = ["Keyboard", "Monitor", "USB-C dock", "Headphones", "Webcam", "Mouse"];
    const filtered = q ? products.filter((p) => p.toLowerCase().includes(q.toLowerCase())) : products;
    const heading = q
      ? `Results matching &quot;${esc(q)}&quot;`
      : "All products";
    const list = filtered.length
      ? filtered.map((p) => `<p>${esc(p)}</p>`).join("")
      : `<p role="status">No results for &quot;${esc(q)}&quot;</p>`;
    const featured = q && q !== "featured"
      ? `<p><a href="/demo/catalog?q=featured">Show featured products</a></p>`
      : "";
    const fragment = `<div id="product-list" class="scroll-list"><p>${heading}</p>${list}</div>${featured}`;
    respond(req, res, fragment, "Product catalogue");
    return;
  }

  if (url.pathname === "/") {
    res.writeHead(302, { Location: "/static/index.html" });
    res.end();
    return;
  }

  const rootPath = normalize(join(root, url.pathname));
  if (rootPath.startsWith(root)) {
    if (await tryFile(res, rootPath)) return;
  }

  const staticPath = normalize(join(root, "static", url.pathname));
  if (staticPath.startsWith(join(root, "static"))) {
    if (await tryFile(res, staticPath)) return;
  }

  if (await tryFile(res, join(root, "static", "index.html"))) return;

  send(res, 404, "<h1>Not found</h1>");
}).listen(port, "127.0.0.1", () => {
  console.log(`Demo server : http://127.0.0.1:${port}/static/index.html`);
});
