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

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

function scope(title, extra = "", attrs = 'history="true"') {
  return `<sco-pe id="main" ${attrs}><h1>${title}</h1>${extra}</sco-pe>`;
}

function parseMultipartText(raw, name) {
  const marker = `name="${name}"`;
  if (!raw.includes(marker)) return "";
  const after = raw.slice(raw.indexOf(marker));
  const value = after.split("\r\n\r\n")[1]?.split("\r\n")[0];
  return value || "";
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
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const name = parseMultipartText(raw, "name");
    const external = parseMultipartText(raw, "external");
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
      page(
        scope(
          "Keep",
          `
      <template scope-assets><script type="module" src="/tests/fixtures/demo-widget.js"></script></template>
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
      <template scope-assets><script type="module" src="/tests/fixtures/demo-widget.js"></script></template>
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

  if (url.pathname === "/slow-one" || url.pathname === "/slow-two") {
    if (url.pathname === "/slow-one") await new Promise((resolve) => setTimeout(resolve, 150));
    send(res, 200, scope(url.pathname === "/slow-one" ? "Slow one" : "Slow two"));
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
