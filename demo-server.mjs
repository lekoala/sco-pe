import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("./", import.meta.url)));
const port = process.env.PORT === undefined ? 4173 : Number(process.env.PORT);

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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// --- Server-dialog demo: plain scoped modal flow over regular links and forms ---
const appointments = new Map([
  ["123", { id: "123", title: "Annual checkup", date: "2026-10-02", time: "09:30" }],
  ["124", { id: "124", title: "Cleaning", date: "2026-10-03", time: "14:00" }],
  // One record per browser project so parallel CI workers never share mutable state.
  ["125", { id: "125", title: "Follow-up", date: "2026-10-04", time: "11:00" }],
]);
// Demo-only in-memory drafts, keyed by appointment. Real apps should tie drafts
// to a user/session and store them outside the server process.
const pendingAppointments = new Map();

function appointmentListInner() {
  const rows = [...appointments.values()]
    .map(
      (a) =>
        `<li>${esc(a.title)} — ${esc(a.date)} at ${esc(a.time)} ` +
        `<a href="/demo/appointments/${a.id}/edit" data-enhance="server-dialog">Edit</a></li>`,
    )
    .join("");
  return `<h1>Appointments</h1><ul>${rows}</ul>`;
}

function editFormInner(appt, error = null) {
  const alert = error
    ? `<div class="alert" role="alert" tabindex="-1"><p>Please fix the highlighted fields.</p></div>`
    : "";
  return `<h2>Edit appointment ${esc(appt.id)}</h2>${alert}
  <form class="stack" method="post" action="/demo/appointments/${appt.id}/edit">
    <div class="field${error ? " danger" : ""}">
      <label class="field-label" for="appt-title">Title</label>
      <input class="input" id="appt-title" name="title" value="${esc(appt.title)}"${error ? ' aria-invalid="true" aria-describedby="appt-title-error"' : ""}>
      ${error ? '<p class="field-error" id="appt-title-error">Title is required.</p>' : ""}
    </div>
    <div class="field">
      <label class="field-label" for="appt-date">Date</label>
      <input class="input" id="appt-date" name="date" type="date" value="${esc(appt.date)}">
    </div>
    <div class="field">
      <label class="field-label" for="appt-time">Time</label>
      <input class="input" id="appt-time" name="time" type="time" value="${esc(appt.time)}">
    </div>
    <div><button class="btn primary">Review</button></div>
  </form>`;
}

function confirmInner(appt) {
  return `<h2>Confirm</h2>
  <p>${esc(appt.title)} — ${esc(appt.date)} at ${esc(appt.time)}</p>
  <form class="stack" method="post" action="/demo/appointments/${appt.id}/confirm">
    <div><button class="btn primary">Confirm</button></div>
  </form>
  <p><a class="btn outline" href="/demo/appointments/${appt.id}/edit" data-enhance="server-dialog">Back</a></p>`;
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

const server = createServer(async (req, res) => {
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

  // --- Server-dialog flow: GET renders the form, invalid POST re-renders it
  // with 422, a valid POST follows Scope-Location to a confirm step, and the
  // final POST answers 204 + Scope-Status + Scope-Event. The same URLs serve
  // full pages when requested without JavaScript.
  const apptEditMatch = url.pathname.match(/^\/demo\/appointments\/([^/]+)\/edit$/);
  const apptConfirmMatch = url.pathname.match(/^\/demo\/appointments\/([^/]+)\/confirm$/);

  if (url.pathname === "/demo/appointments" && req.method === "GET") {
    const fragment = scope("main", "Appointments", appointmentListInner().replace("<h1>Appointments</h1>", ""));
    respond(req, res, fragment, "Appointments", { Vary: "Scope-Request" });
    return;
  }

  if (apptEditMatch) {
    const appt = appointments.get(apptEditMatch[1]);
    if (!appt) {
      send(res, 404, "<h1>Not found</h1>");
      return;
    }
    const isScope = req.headers["scope-request"] === "true";
    const draft = pendingAppointments.get(appt.id) || appt;
    if (req.method === "POST") {
      const raw = await readBody(req);
      const params = new URLSearchParams(raw);
      const title = (params.get("title") || "").trim();
      if (!title) {
        const fragment = editFormInner(draft, "title");
        if (isScope) {
          send(res, 422, fragment, {
            Vary: "Scope-Request",
            "Scope-Alert": "Please fix the highlighted fields",
          });
        } else {
          send(res, 422, htmlDoc(fragment, "Edit"), { Vary: "Scope-Request" });
        }
        return;
      }
      pendingAppointments.set(appt.id, {
        ...appt,
        title,
        date: params.get("date") || draft.date,
        time: params.get("time") || draft.time,
      });
      if (isScope) {
        send(res, 204, "", {
          Vary: "Scope-Request",
          "Scope-Location": `/demo/appointments/${appt.id}/confirm`,
        });
      } else {
        res.writeHead(303, { Location: `/demo/appointments/${appt.id}/confirm` });
        res.end();
      }
      return;
    }
    const fragment = editFormInner(draft);
    respond(req, res, fragment, "Edit appointment", { Vary: "Scope-Request" });
    return;
  }

  if (apptConfirmMatch) {
    const appt = appointments.get(apptConfirmMatch[1]);
    if (!appt) {
      send(res, 404, "<h1>Not found</h1>");
      return;
    }
    const isScope = req.headers["scope-request"] === "true";
    const draft = pendingAppointments.get(appt.id);
    if (!draft) {
      res.writeHead(303, { Location: `/demo/appointments/${appt.id}/edit` });
      res.end();
      return;
    }
    if (req.method === "POST") {
      appointments.set(appt.id, draft);
      pendingAppointments.delete(appt.id);
      if (isScope) {
        send(res, 204, "", {
          Vary: "Scope-Request",
          "Scope-Status": "Appointment updated",
          "Scope-Event": "appointment.changed",
        });
      } else {
        res.writeHead(303, { Location: "/demo/appointments" });
        res.end();
      }
      return;
    }
    const fragment = confirmInner(draft);
    respond(req, res, fragment, "Confirm", { Vary: "Scope-Request" });
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
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Demo server : http://127.0.0.1:${server.address().port}/static/index.html`);
});
