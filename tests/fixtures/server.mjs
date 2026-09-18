import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("../../", import.meta.url)));
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function page(body) {
  return `<!doctype html>
<html lang="en">
<head>
  <title>sco-pe fixture</title>
  <script type="module" src="/sco-pe.js"></script>
</head>
<body>
  <div id="scope-status" role="status" aria-live="polite" aria-atomic="true"></div>
  <div id="scope-alert" role="alert" aria-atomic="true"></div>
  ${body}
</body>
</html>`;
}

function pageWithModule(body, src) {
  return page(`<script type="module" src="${src}"></script>${body}`);
}

function demoWidgetPage(body) {
  return pageWithModule(body, "/tests/fixtures/demo-widget.js");
}

function stateWidgetPage(body) {
  return pageWithModule(body, "/tests/fixtures/state-widget.js");
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

function scope(title, extra = "", attrs = 'history="true"') {
  return `<sco-pe id="main" ${attrs}><h1>${title}</h1>${extra}</sco-pe>`;
}

function demoScope(id, title, extra = "", attrs = 'history="true"') {
  return `<sco-pe id="${id}" ${attrs}><h1>${title}</h1>${extra}</sco-pe>`;
}

function parseMultipartText(raw, name) {
  const marker = `name="${name}"`;
  if (!raw.includes(marker)) return "";
  const after = raw.slice(raw.indexOf(marker));
  const value = after.split("\r\n\r\n")[1]?.split("\r\n")[0];
  return value || "";
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function bodyValue(raw, contentType, name) {
  if (contentType.startsWith("multipart/form-data")) return parseMultipartText(raw, name);
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    return new URLSearchParams(raw).get(name) || "";
  }
  if (contentType.startsWith("text/plain")) {
    const line = raw.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
    return line?.slice(name.length + 1) || "";
  }
  return "";
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/") {
    send(res, 200, page(`<sco-pe id="main" src="/users" history="true"></sco-pe>`));
    return;
  }

  if (url.pathname === "/users" && req.method === "POST") {
    send(
      res,
      422,
      scope(
        "New user",
        `
      <form id="create" action="/users" method="post" aria-describedby="form-errors">
        <div id="form-errors" role="alert">Please fix the highlighted fields.</div>
        <label for="email">Email</label>
        <input id="email" name="email" aria-invalid="true" aria-describedby="email-error">
        <p id="email-error">Email is required.</p>
        <button name="save" value="1">Save</button>
      </form>
    `,
      ),
      { "Scope-Alert": "Please fix the highlighted fields." },
    );
    return;
  }

  if (url.pathname === "/users" && url.searchParams.get("page") === "2") {
    send(res, 200, scope("Users page 2", `<a href="/users" id="back">Back</a>`), {
      "Scope-Status": "Page 2 loaded",
    });
    return;
  }

  if (url.pathname === "/users") {
    send(
      res,
      200,
      scope(
        "Users",
        `
      <nav><a href="/users?page=2" id="next">Next</a></nav>
      <form id="filter" action="/search" method="get"><input name="q" value="ada"><button>Search</button></form>
      <form id="create" action="/users" method="post"><input id="email" name="email"><button name="save" value="1">Save</button></form>
      <a id="component-link" href="/component">Component</a>
      <a id="json-link" href="/json">JSON</a>
    `,
      ),
    );
    return;
  }

  if (url.pathname === "/demo/users" && req.method === "POST") {
    send(
      res,
      200,
      scope(
        "User saved",
        '<p role="status">The form was submitted without leaving the page.</p><a href="/demo/users">Back to users</a>',
      ),
      { "Scope-Status": "User saved" },
    );
    return;
  }

  if (url.pathname === "/demo/users" && url.searchParams.get("page") === "2") {
    send(
      res,
      200,
      scope(
        "Users — page 2",
        '<p>History, title, focus and the live region update with this response.</p><a href="/demo/users">Previous page</a>',
      ),
      { "Scope-Status": "Page 2 loaded" },
    );
    return;
  }

  if (url.pathname === "/demo/users") {
    const q = url.searchParams.get("q");
    const title = q ? `Search results: ${q}` : "Users";
    send(
      res,
      200,
      scope(
        title,
        `
          <nav aria-label="Users"><a href="/demo/users?page=2">Next page</a></nav>
          <form action="/demo/users" method="get">
            <label>Search <input name="q" value="${q || ""}"></label>
            <button>Search</button>
          </form>
          <form action="/demo/users" method="post" data-confirm="Create this user?">
            <label>Email <input name="email" type="email" required></label>
            <button>Create user</button>
          </form>
        `,
      ),
    );
    return;
  }

  if (url.pathname === "/demo/orders") {
    send(
      res,
      200,
      demoScope(
        "orders",
        "Recent orders",
        '<p>#1042 — awaiting payment</p><a href="/demo/order-1042">Mark #1042 as paid</a>',
      ),
    );
    return;
  }

  if (url.pathname === "/demo/stats") {
    send(
      res,
      200,
      demoScope("stats", "Today", "<p>4 orders awaiting payment.</p>", 'scroll="none"'),
    );
    return;
  }

  if (url.pathname === "/demo/order-1042") {
    send(
      res,
      200,
      demoScope("stats", "Today", "<p>3 orders awaiting payment.</p>", 'scroll="none"'),
      {
        "Scope-Target": "stats",
        "Scope-Status": "Order #1042 marked as paid",
      },
    );
    return;
  }

  if (url.pathname === "/demo/catalog") {
    const q = url.searchParams.get("q") || "";
    const item = q ? `Results matching “${q}”` : "All products";
    send(
      res,
      200,
      demoScope(
        "catalog",
        "Product catalogue",
        `
          <form action="/demo/catalog" method="get"><label>Filter <input name="q" value="${q}"></label></form>
          <div id="product-list" class="scroll-list"><p>${item}</p><p>Keyboard</p><p>Monitor</p><p>USB-C dock</p><p>Headphones</p><p>Webcam</p><p>Mouse</p></div>
          <a href="/demo/catalog?q=featured">Show featured products</a>
        `,
        'history="true" autosubmit="250" scroll="keep" transition="fade" transition-timeout="180"',
      ),
    );
    return;
  }

  if (url.pathname === "/search") {
    send(res, 200, scope(`Search: ${url.searchParams.get("q") || ""}`));
    return;
  }

  if (url.pathname === "/multi-get") {
    send(
      res,
      200,
      page(
        scope(
          "Multiple GET fields",
          `<form id="multi-filter" action="/multi-result?ignored=value" method="get">
            <label><input id="tag-a" type="checkbox" name="tag" value="alpha"> Alpha</label>
            <label><input id="tag-b" type="checkbox" name="tag" value="beta"> Beta</label>
            <button>Filter</button>
          </form>`,
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/multi-result") {
    send(res, 200, scope(`Tags: ${url.searchParams.getAll("tag").join(", ")}`));
    return;
  }

  if (url.pathname === "/disabled") {
    send(
      res,
      200,
      page(scope("Disabled", `<a id="disabled-next" href="/disabled-next">Next</a>`, "disabled")),
    );
    return;
  }

  if (url.pathname === "/disabled-next") {
    send(res, 200, page(scope("Disabled next")));
    return;
  }

  if (url.pathname === "/component") {
    send(res, 200, scope("Component", `<demo-widget id="widget">fallback</demo-widget>`), {
      "Scope-Script": "/tests/fixtures/demo-widget.js",
    });
    return;
  }

  if (url.pathname === "/json") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Scope-Alert": "JSON refused",
    });
    res.end(JSON.stringify({ html: '<sco-pe id="main"><h1>Should not render</h1></sco-pe>' }));
    return;
  }

  if (url.pathname === "/json-script") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Scope-Alert": "JSON script refused",
      "Scope-Script": "/tests/fixtures/bad-module.js",
    });
    res.end(JSON.stringify({ html: '<sco-pe id="main"><h1>Should not render</h1></sco-pe>' }));
    return;
  }

  if (url.pathname === "/native-links") {
    send(
      res,
      200,
      page(
        scope(
          "Native links",
          `<a id="download-link" href="/native-destination" download>Download</a>
           <a id="modified-link" href="/native-destination">Modified</a>
           <a id="empty-anchor" href="#">Top</a>`,
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/native-destination") {
    send(res, 200, scope("Native destination"));
    return;
  }

  if (url.pathname === "/attrs") {
    send(
      res,
      200,
      page(
        scope(
          "Attrs",
          `<a id="attrs-link" href="/attrs-response">Replace</a>`,
          'src="/attrs-fragment" history="true" scroll="keep" focus="heading" autosubmit="60" keep="same-html" transition="fade" class="client-owned"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/attrs-fragment") {
    send(res, 200, scope("Attrs fragment"));
    return;
  }

  if (url.pathname === "/attrs-response") {
    send(
      res,
      200,
      '<sco-pe id="main" class="server-decoration"><h1>Attrs replaced</h1><a id="attrs-clear-link" href="/attrs-response-clear">Clear decoration</a></sco-pe>',
    );
    return;
  }

  if (url.pathname === "/attrs-response-clear") {
    send(res, 200, '<sco-pe id="main"><h1>Attrs cleared</h1></sco-pe>');
    return;
  }

  if (url.pathname === "/dialog-form") {
    send(
      res,
      200,
      page(
        scope(
          "Dialog form",
          `<form id="dialog-form" method="dialog" action="/dialog-submit"><button>Close</button></form>`,
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/dialog-submit") {
    send(res, 200, scope("Dialog submitted"));
    return;
  }

  if (url.pathname === "/hash") {
    send(
      res,
      200,
      page(
        scope(
          "Hash",
          `
      <a id="hash-link" href="#section-2">Jump to section 2</a>
      <div style="height: 1200px"></div>
      <h2 id="section-2">Section 2</h2>
    `,
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/scroll") {
    send(
      res,
      200,
      page(
        scope(
          "Scroll",
          `
      <div id="viewport" style="block-size: 80px; overflow: auto">
        <p style="height: 220px">Large list</p>
      </div>
      <a id="refresh-keep" href="/scroll-refresh">Refresh</a>
    `,
          'history="true" scroll="keep"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/scroll-refresh") {
    send(
      res,
      200,
      scope(
        "Scroll",
        `
      <div id="viewport" style="block-size: 80px; overflow: auto">
        <p style="height: 220px">Refreshed list</p>
      </div>
      <a id="refresh-keep" href="/scroll-refresh">Refresh</a>
    `,
        'history="true" scroll="keep"',
      ),
    );
    return;
  }

  if (url.pathname === "/long") {
    send(
      res,
      200,
      page(`
      <div style="height: 2000px">Spacer</div>
      <sco-pe id="main" history="true" scroll="top">
        <h1>Long page</h1>
        <a id="scroll-top-link" href="/users">Users</a>
      </sco-pe>
    `),
    );
    return;
  }

  if (url.pathname === "/submitters") {
    send(
      res,
      200,
      page(`
      <sco-pe id="main" history="true">
        <h1>Submitters</h1>
        <form id="command-form" action="/submitter-default" method="post">
          <input name="name" value="Ada">
          <button id="preview" type="submit" name="command" value="preview" formaction="/submitter-preview" formmethod="get">Preview</button>
        </form>
        <form id="external-form" action="/external-default" method="post">
          <input name="name" value="Grace">
        </form>
      </sco-pe>
      <button id="external-button" type="submit" form="external-form" name="external" value="1" formaction="/external-override" formmethod="post">External save</button>
    `),
    );
    return;
  }

  if (url.pathname === "/submitter-preview") {
    send(
      res,
      200,
      scope(`Preview: ${url.searchParams.get("name")} / ${url.searchParams.get("command")}`),
    );
    return;
  }

  if (url.pathname === "/external-override" && req.method === "POST") {
    const raw = await readRequestBody(req);
    const contentType = req.headers["content-type"] || "";
    const name = bodyValue(raw, contentType, "name");
    const external = bodyValue(raw, contentType, "external");
    send(res, 200, scope(`External: ${name} / ${external}`));
    return;
  }

  if (url.pathname === "/autosubmit") {
    send(
      res,
      200,
      page(`
      <sco-pe id="main" src="/autosubmit-form" history="true" autosubmit="60"></sco-pe>
    `),
    );
    return;
  }

  if (url.pathname === "/autosubmit-form") {
    const q = url.searchParams.get("q") || "";
    send(
      res,
      200,
      scope(
        `Autosubmit: ${q}`,
        `
      <form id="live-filter" action="/autosubmit-form" method="get">
        <input id="live-q" name="q" value="${q}">
      </form>
    `,
        'history="true" autosubmit="60"',
      ),
    );
    return;
  }

  if (url.pathname === "/keep") {
    send(
      res,
      200,
      demoWidgetPage(
        scope(
          "Keep",
          `
      
      <a id="refresh-keep-widget" href="/keep-refresh">Refresh</a>
      <demo-widget id="expensive-widget">server widget</demo-widget>
    `,
          'history="true" keep="same-html"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/keep-refresh") {
    send(
      res,
      200,
      scope(
        "Keep refreshed",
        `
      
      <a id="refresh-keep-widget" href="/keep-refresh">Refresh</a>
      <demo-widget id="expensive-widget">server widget</demo-widget>
    `,
        'history="true" keep="same-html"',
      ),
    );
    return;
  }

  if (url.pathname === "/transition") {
    send(
      res,
      200,
      page(
        scope(
          "Transition",
          `
      <a id="transition-link" href="/transition-next">Next</a>
    `,
          'history="true" transition="fade" transition-timeout="120"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/transition-next") {
    send(
      res,
      200,
      scope(
        "Transition next",
        `<p>New content</p>`,
        'history="true" transition="fade" transition-timeout="120"',
      ),
    );
    return;
  }

  if (url.pathname === "/revalidate") {
    send(
      res,
      200,
      page(
        scope(
          "Revalidate",
          `
      <button id="revalidate-button" type="button">Revalidate</button>
      <script type="module">
        document.addEventListener('click', (event) => {
          if (event.target.id === 'revalidate-button') document.getElementById('main').revalidate()
        })
      </script>
    `,
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/select") {
    send(
      res,
      200,
      page(
        scope(
          "Select",
          `<a id="select-link" href="/select-full">Select</a>`,
          'select="#replacement"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/select-full") {
    send(
      res,
      200,
      page(`<div id="replacement"><h1>Selected content</h1><p>From a document.</p></div>`),
    );
    return;
  }

  if (url.pathname === "/confirm") {
    if (req.method === "POST") {
      send(res, 200, scope("Confirmed"));
    } else {
      send(
        res,
        200,
        page(
          scope(
            "Confirm",
            `<form id="confirm-form" action="/confirm" method="post" data-confirm="Continue?"><button>Send</button></form>`,
          ),
        ),
      );
    }
    return;
  }

  if (url.pathname === "/prg" && req.method === "GET") {
    send(
      res,
      200,
      page(
        scope(
          "PRG",
          `<form id="prg-form" action="/prg" method="post"><button>Save</button></form>`,
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/prg" && req.method === "POST") {
    send(res, 204, "", { "Scope-Location": "/prg-result" });
    return;
  }

  if (url.pathname === "/prg-result") {
    send(res, 200, scope("PRG complete"));
    return;
  }

  if (url.pathname === "/target") {
    send(
      res,
      200,
      page(`
        <sco-pe id="main" history="true"><h1>Main stays put</h1><a id="target-link" href="/target-response">Update sidebar</a></sco-pe>
        <sco-pe id="sidebar"><h2>Sidebar initial</h2></sco-pe>
      `),
    );
    return;
  }

  if (url.pathname === "/target-response") {
    send(res, 200, '<sco-pe id="sidebar"><h2>Sidebar updated</h2></sco-pe>', {
      "Scope-Target": "sidebar",
    });
    return;
  }

  if (url.pathname === "/redirect") {
    send(
      res,
      200,
      page(scope("Redirect", `<a id="redirect-link" href="/redirect-response">Leave</a>`)),
    );
    return;
  }

  if (url.pathname === "/redirect-response") {
    send(res, 204, "", { "Scope-Redirect": "/redirect-result" });
    return;
  }

  if (url.pathname === "/redirect-result") {
    send(res, 200, page(scope("Redirected")));
    return;
  }

  if (url.pathname === "/cancel") {
    send(
      res,
      200,
      page(
        scope(
          "Cancel",
          '<a id="slow-one" href="/slow-one">One</a> <a id="slow-two" href="/slow-two">Two</a>',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/cancel-preserve") {
    send(
      res,
      200,
      page(
        `${scope(
          "Cancel preserve",
          '<a id="preserved-slow" href="/slow-one">Slow</a> <a id="canceled-next" href="/blocked">Canceled</a>',
        )}
        <script>document.addEventListener("scope:before-load", (event) => { if (event.detail.url.endsWith("/blocked")) event.preventDefault(); });</script>`,
      ),
    );
    return;
  }

  if (url.pathname === "/slow-one" || url.pathname === "/slow-two") {
    if (url.pathname === "/slow-one") await new Promise((resolve) => setTimeout(resolve, 150));
    send(res, 200, scope(url.pathname === "/slow-one" ? "Slow one" : "Slow two"));
    return;
  }

  if (url.pathname === "/busy-race") {
    send(
      res,
      200,
      page(
        scope(
          "Busy race",
          '<a id="busy-one" href="/busy-one">One</a> <a id="busy-two" href="/busy-two">Two</a>',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/asset-race") {
    send(
      res,
      200,
      page(
        scope(
          "Asset race",
          '<a id="asset-slow" href="/asset-slow">Slow asset</a> <a id="asset-fast" href="/asset-fast">Fast</a>',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/asset-slow") {
    send(res, 200, scope("Asset slow"), {
      "Scope-Script": "/tests/fixtures/slow-module.js",
    });
    return;
  }

  if (url.pathname === "/asset-fast") {
    send(res, 200, scope("Asset fast"));
    return;
  }

  if (url.pathname === "/busy-one" || url.pathname === "/busy-two") {
    await new Promise((resolve) => setTimeout(resolve, 150));
    send(res, 200, scope(url.pathname === "/busy-one" ? "Busy one" : "Busy two"));
    return;
  }

  if (url.pathname === "/before-load") {
    send(
      res,
      200,
      page(
        `${scope("Before load", '<a id="blocked-link" href="/blocked">Blocked</a>')}
        <script>document.addEventListener("scope:before-load", (event) => { if (event.detail.url.endsWith("/blocked")) event.preventDefault(); });</script>`,
      ),
    );
    return;
  }

  if (url.pathname === "/blocked") {
    send(res, 200, scope("Should not load"));
    return;
  }

  if (url.pathname === "/nested") {
    send(
      res,
      200,
      page(
        '<sco-pe id="main" history="true"><h1>Parent</h1><sco-pe id="child"><h2>Child</h2><a id="child-link" href="/child-next">Next child</a></sco-pe></sco-pe>',
      ),
    );
    return;
  }

  if (url.pathname === "/child-next") {
    send(res, 200, '<sco-pe id="child"><h2>Child updated</h2></sco-pe>');
    return;
  }

  if (url.pathname === "/history") {
    send(res, 200, page(scope("History start", '<a id="history-one" href="/history-one">One</a>')));
    return;
  }

  if (url.pathname === "/history-one") {
    send(res, 200, scope("History one", '<a id="history-two" href="/history-two">Two</a>'));
    return;
  }

  if (url.pathname === "/history-two") {
    send(res, 200, scope("History two"));
    return;
  }

  if (url.pathname === "/request-header") {
    send(
      res,
      200,
      page(
        scope(
          "Request header",
          '<a id="request-header-link" href="/request-header-result">Check</a>',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/request-header-result") {
    send(
      res,
      200,
      scope(
        `Request: ${req.headers["scope-request"] || "missing"} / ${req.headers["x-requested-with"] || "none"}`,
      ),
    );
    return;
  }

  if (url.pathname === "/encoding") {
    send(
      res,
      200,
      page(
        scope(
          "Encoding",
          `
          <form id="encoding-form" action="/encoding-submit" method="post">
            <input name="name" value="Ada">
            <button id="urlencoded-submit" name="command" value="default">Default</button>
            <button id="multipart-submit" name="command" value="multipart" formenctype="multipart/form-data">Multipart</button>
            <button id="plain-submit" name="command" value="plain" formenctype="text/plain">Plain</button>
          </form>`,
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/encoding-submit" && req.method === "POST") {
    const raw = await readRequestBody(req);
    const contentType = req.headers["content-type"] || "";
    send(
      res,
      200,
      scope(
        `Encoding: ${contentType.split(";")[0]} / ${bodyValue(raw, contentType, "name")} / ${bodyValue(raw, contentType, "command")}`,
      ),
    );
    return;
  }

  if (url.pathname === "/location-status") {
    send(
      res,
      200,
      page(
        scope(
          "Location status",
          '<a id="location-status-link" href="/location-status-start">Save</a>',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/location-status-start") {
    send(res, 200, "", {
      "Scope-Location": "/location-status-result",
      "Scope-Status": "Saved before scoped redirect",
    });
    return;
  }

  if (url.pathname === "/location-status-result") {
    send(res, 200, scope("Location status complete"));
    return;
  }

  if (url.pathname === "/document-attrs") {
    send(
      res,
      200,
      `<!doctype html><html lang="en" class="client-html" data-theme="client"><head><title>Client attrs</title><script type="module" src="/sco-pe.js"></script></head><body class="client-body" style="--client: 1"><div id="scope-status" role="status"></div><div id="scope-alert" role="alert"></div><sco-pe id="main" history="true"><h1>Document attrs</h1><a id="document-attrs-link" href="/document-attrs-response">Update</a></sco-pe></body></html>`,
    );
    return;
  }

  if (url.pathname === "/document-attrs-response") {
    send(
      res,
      200,
      `<!doctype html><html lang="fr" class="server-html" data-theme="server"><head><title>Server attrs</title></head><body class="server-body" style="--server: 1"><sco-pe id="main"><h1>Document attrs updated</h1><a id="document-attrs-link" href="/document-attrs-response">Update</a></sco-pe></body></html>`,
    );
    return;
  }

  if (url.pathname === "/local-alert") {
    send(
      res,
      200,
      page(scope("Local alert", '<a id="local-alert-link" href="/local-alert-response">Fail</a>')),
    );
    return;
  }

  if (url.pathname === "/local-alert-response") {
    send(res, 422, scope("Local alert failed", '<div role="alert">Local validation error</div>'));
    return;
  }

  if (url.pathname === "/keep-changed") {
    send(
      res,
      200,
      stateWidgetPage(
        scope(
          "Keep changed",
          `<a id="keep-changed-link" href="/keep-changed-result">Change</a><state-widget id="changed-widget" data-version="1">one</state-widget>`,
          'history="true" keep="same-html"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/keep-insert") {
    send(
      res,
      200,
      stateWidgetPage(
        scope(
          "Keep insert",
          `<a id="keep-insert-link" href="/keep-insert-result">Insert</a><state-widget id="insert-widget">Stable</state-widget>`,
          'history="true" keep="same-html"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/keep-insert-result") {
    send(
      res,
      200,
      scope(
        "Keep insert result",
        `<state-widget id="insert-widget">Stable</state-widget><section id="inserted-panel"><p>Inserted safely</p></section>`,
        'history="true" keep="same-html"',
      ),
    );
    return;
  }

  if (url.pathname === "/reconnect") {
    send(res, 200, page('<sco-pe id="main" src="/reconnect-content" history="true"></sco-pe>'));
    return;
  }

  if (url.pathname === "/reconnect-content") {
    send(res, 200, scope("Reconnect content", '<p id="reconnect-marker">Stable</p>'));
    return;
  }

  if (url.pathname === "/keep-changed-result") {
    send(
      res,
      200,
      scope(
        "Keep changed result",
        `<state-widget id="changed-widget" data-version="2">two</state-widget>`,
        'history="true" keep="same-html"',
      ),
    );
    return;
  }

  if (url.pathname === "/keep-reorder") {
    send(
      res,
      200,
      stateWidgetPage(
        scope(
          "Keep reorder",
          `<a id="keep-reorder-link" href="/keep-reorder-result">Reorder</a><div id="widget-list"><state-widget id="widget-a">A</state-widget><p id="middle">Middle</p><state-widget id="widget-b">B</state-widget></div>`,
          'history="true" keep="same-html"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/keep-reorder-result") {
    send(
      res,
      200,
      scope(
        "Keep reorder result",
        `<div id="widget-list"><state-widget id="widget-b">B</state-widget><p id="middle">Middle updated</p><state-widget id="widget-a">A</state-widget></div>`,
        'history="true" keep="same-html"',
      ),
    );
    return;
  }

  if (url.pathname === "/keep-validation") {
    send(
      res,
      200,
      stateWidgetPage(
        scope(
          "Keep validation",
          `<form action="/keep-validation-result" method="post"><fieldset id="widget-field"><legend>Widget</legend><state-widget id="form-widget">Stable</state-widget></fieldset><button id="keep-validation-submit">Submit</button></form>`,
          'history="true" keep="same-html"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/keep-validation-result" && req.method === "POST") {
    send(
      res,
      422,
      scope(
        "Keep validation failed",
        `<form action="/keep-validation-result" method="post"><div role="alert" tabindex="-1">Please fix the form</div><fieldset id="widget-field"><legend>Widget</legend><state-widget id="form-widget">Stable</state-widget><p id="widget-error">A server error</p></fieldset><button>Submit</button></form>`,
        'history="true" keep="same-html"',
      ),
    );
    return;
  }

  if (url.pathname === "/transition-widget") {
    send(
      res,
      200,
      stateWidgetPage(
        scope(
          "Transition widget",
          `<a id="transition-widget-link" href="/transition-widget-next">Next</a><state-widget id="transition-state-widget">Stable</state-widget>`,
          'history="true" transition="fade" transition-timeout="200"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/transition-widget-next") {
    send(
      res,
      200,
      scope(
        "Transition widget next",
        "<p>Done</p>",
        'history="true" transition="fade" transition-timeout="200"',
      ),
    );
    return;
  }

  if (url.pathname === "/inline-script") {
    send(
      res,
      200,
      page(
        scope(
          "Inline script",
          '<a id="inline-script-link" href="/inline-script-response">Load</a>',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/inline-script-response") {
    send(
      res,
      200,
      scope(
        "Inline script removed",
        '<script>window.__inlineScriptExecuted = true</script><style id="inline-style">#inline-result{color:red}</style><link id="inline-link" rel="stylesheet" href="/static/demo.css"><p id="inline-result">Safe markup</p>',
      ),
    );
    return;
  }

  if (url.pathname === "/mismatched-scope") {
    send(
      res,
      200,
      page(scope("Mismatch", '<a id="mismatch-link" href="/mismatched-scope-response">Load</a>')),
    );
    return;
  }

  if (url.pathname === "/mismatched-scope-response") {
    send(res, 200, '<sco-pe id="other"><h1>Wrong scope</h1></sco-pe>');
    return;
  }

  if (url.pathname === "/target-asset-race") {
    send(
      res,
      200,
      page(`
        <sco-pe id="main" history="true"><h1>Main</h1><a id="target-slow-link" href="/target-slow">Update sidebar</a></sco-pe>
        <sco-pe id="sidebar" history="false"><h2>Sidebar initial</h2><a id="sidebar-update-link" href="/sidebar-update">Sidebar nav</a></sco-pe>
      `),
    );
    return;
  }

  if (url.pathname === "/target-slow") {
    send(
      res,
      200,
      '<sco-pe id="sidebar"><h2>Routed old</h2><slow-widget id="routed-widget"></slow-widget></sco-pe>',
      { "Scope-Target": "sidebar" },
    );
    return;
  }

  if (url.pathname === "/sidebar-update") {
    send(res, 200, "<h2>Sidebar new</h2>");
    return;
  }

  if (url.pathname === "/swap-cancel") {
    send(
      res,
      200,
      page(`
        <sco-pe id="main" history="true" scope-swap="#list">
          <div id="list"><h1>Swap start</h1><a id="swap-slow" href="/swap-slow">Slow</a> <a id="swap-fast" href="/swap-fast">Fast</a></div>
        </sco-pe>
      `),
    );
    return;
  }

  if (url.pathname === "/swap-slow") {
    send(res, 200, '<div id="list"><h1>Swapped old</h1><slow-widget></slow-widget></div>');
    return;
  }

  if (url.pathname === "/swap-fast") {
    send(res, 200, '<div id="list"><h1>Swapped fast</h1></div>');
    return;
  }

  if (url.pathname === "/autosubmit-validation") {
    send(
      res,
      200,
      page(`
        <sco-pe id="main" history="true" autosubmit="30">
          <h1>Autosubmit validation</h1>
          <form id="vform" action="/autosubmit-validation-result" method="get">
            <input id="vq" name="q" required>
          </form>
        </sco-pe>
      `),
    );
    return;
  }

  if (url.pathname === "/autosubmit-validation-result") {
    const q = url.searchParams.get("q") || "";
    send(
      res,
      200,
      `<h1>Valid: ${q}</h1><form id="vform" action="/autosubmit-validation-result" method="get"><input id="vq" name="q" value="${q}" required></form>`,
    );
    return;
  }

  if (url.pathname === "/autosubmit-novalidate") {
    send(
      res,
      200,
      page(`
        <sco-pe id="main" history="true" autosubmit="30">
          <h1>Autosubmit novalidate</h1>
          <form id="vform" action="/autosubmit-novalidate-result" method="get" novalidate>
            <input id="vq" name="q" required>
          </form>
        </sco-pe>
      `),
    );
    return;
  }

  if (url.pathname === "/autosubmit-novalidate-result") {
    const q = url.searchParams.get("q") || "";
    send(res, 200, `<h1>Novalidate: ${q}</h1>`);
    return;
  }

  if (url.pathname === "/timeout") {
    send(
      res,
      200,
      page(
        scope(
          "Timeout",
          '<a id="timeout-link" href="/very-slow">Slow</a>',
          'history="true" timeout="60"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/very-slow") {
    await new Promise((resolve) => setTimeout(resolve, 300));
    send(res, 200, scope("Very slow"));
    return;
  }

  if (url.pathname === "/sync-drop") {
    send(
      res,
      200,
      page(
        scope(
          "Sync drop",
          '<a id="sync-one" href="/slow-one">One</a> <a id="sync-two" href="/slow-two">Two</a>',
          'history="false" sync="drop"',
        ),
      ),
    );
    return;
  }

  if (url.pathname === "/sync-queue") {
    send(
      res,
      200,
      page(
        scope(
          "Sync queue",
          '<a id="sync-one" href="/slow-one">One</a> <a id="sync-two" href="/slow-two">Two</a>',
          'history="false" sync="queue"',
        ),
      ),
    );
    return;
  }

  const filePath = normalize(join(root, url.pathname));
  if (filePath.startsWith(root)) {
    try {
      const body = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": types[extname(filePath)] || "application/octet-stream",
      });
      res.end(body);
      return;
    } catch {}
  }

  send(res, 404, page(scope("Not found")));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Fixture server listening on http://127.0.0.1:${port}`);
});
