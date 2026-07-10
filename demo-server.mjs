import { context } from "esbuild";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = join(fileURLToPath(new URL("./", import.meta.url)));
const port = Number(process.env.PORT || 4173);

const ctx = await context({
  entryPoints: ["sco-pe.js"],
  bundle: true,
  outdir: "dist",
  write: false,
});

const { port: esbuildPort } = await ctx.serve({
  servedir: root,
  host: "127.0.0.1",
});

console.log(`esbuild ready on :${esbuildPort}`);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

function s(title, extra = "", attrs = 'history="true"') {
  return `<sco-pe id="main" ${attrs}><h1>${title}</h1>${extra}</sco-pe>`;
}

async function proxy(req, res, esPort) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = req.method !== "GET" && req.method !== "HEAD"
    ? await new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); })
    : undefined;

  const esRes = await fetch(`http://127.0.0.1:${esPort}${url.pathname}${url.search}`, {
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${esPort}`, "accept-encoding": "identity" },
    body,
    duplex: body ? "half" : undefined,
  });

  const hdrs = {};
  for (const [k, v] of esRes.headers) hdrs[k] = v;
  res.writeHead(esRes.status, hdrs);
  res.end(Buffer.from(await esRes.arrayBuffer()));
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/demo/users" && req.method === "POST") {
    send(res, 200, s("User saved", '<p role="status">User created.</p><a href="/demo/users">Back</a>'), { "Scope-Status": "User saved" });
    return;
  }

  if (url.pathname === "/demo/users" && url.searchParams.get("page") === "2") {
    send(res, 200, s("Users — page 2", '<a href="/demo/users">Previous page</a>'), { "Scope-Status": "Page 2 loaded" });
    return;
  }

  if (url.pathname === "/demo/users") {
    const q = url.searchParams.get("q") || "";
    const title = q ? `Search: ${q}` : "Users";
    send(res, 200, s(title, `
      <nav aria-label="Users"><a href="/demo/users?page=2">Next page</a></nav>
      <form action="/demo/users" method="get">
        <label>Search <input name="q" value="${q}"></label>
        <button>Search</button>
      </form>
      <form action="/demo/users" method="post" data-confirm="Create this user?">
        <label>Email <input name="email" type="email" required></label>
        <button>Create user</button>
      </form>
    `));
    return;
  }

  if (url.pathname === "/demo/orders") {
    send(res, 200, `
      <sco-pe id="orders" history="true"><h1>Recent orders</h1>
        <p>#1042 — awaiting payment</p>
        <a href="/demo/order-1042">Mark #1042 as paid</a>
      </sco-pe>
    `);
    return;
  }

  if (url.pathname === "/demo/stats") {
    send(res, 200, '<sco-pe id="stats" scroll="none"><h1>Today</h1><p>4 orders awaiting payment.</p></sco-pe>');
    return;
  }

  if (url.pathname === "/demo/order-1042") {
    send(res, 200, '<sco-pe id="stats" scroll="none"><h1>Today</h1><p>3 orders awaiting payment.</p></sco-pe>', {
      "Scope-Target": "stats",
      "Scope-Status": "Order #1042 marked as paid",
    });
    return;
  }

  if (url.pathname === "/demo/catalog") {
    const q = url.searchParams.get("q") || "";
    const item = q ? `Results matching "${q}"` : "All products";
    send(res, 200, `
      <sco-pe id="catalog" history="true" autosubmit="250" scroll="keep" transition="fade" transition-timeout="180">
        <h1>Product catalogue</h1>
        <form action="/demo/catalog" method="get"><label>Filter <input name="q" value="${q}"></label></form>
        <div id="product-list" class="scroll-list"><p>${item}</p><p>Keyboard</p><p>Monitor</p><p>USB-C dock</p><p>Headphones</p><p>Webcam</p><p>Mouse</p></div>
        <a href="/demo/catalog?q=featured">Show featured products</a>
      </sco-pe>
    `);
    return;
  }

  if (url.pathname === "/") {
    res.writeHead(302, { Location: "/static/index.html" });
    res.end();
    return;
  }

  try {
    await proxy(req, res, esbuildPort);
  } catch (err) {
    send(res, 502, `<h1>Gateway error</h1><p>${err.message}</p>`);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Demo server : http://127.0.0.1:${port}/static/index.html`);
});

process.on("SIGINT", async () => {
  await ctx.dispose();
  process.exit();
});
