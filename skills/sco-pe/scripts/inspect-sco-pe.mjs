#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

function detectRoot(start = process.cwd()) {
  const explicit = process.env.SCO_PE_ROOT;
  if (explicit) {
    const root = path.resolve(explicit);
    if (!exists(path.join(root, "package.json"))) {
      throw new Error(`SCO_PE_ROOT does not contain package.json: ${root}`);
    }
    return root;
  }

  let dir = path.resolve(start);
  while (true) {
    const localPkg = path.join(dir, "package.json");
    if (exists(localPkg)) {
      try {
        const pkg = readJson(localPkg);
        if (pkg.name === "@lekoala/sco-pe") return dir;
      } catch {
        // Ignore malformed unrelated package.json files.
      }
    }

    const installed = path.join(dir, "node_modules", "@lekoala", "sco-pe");
    if (exists(path.join(installed, "package.json"))) return installed;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  process.stdout.write(`sco-pe inspector\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  inspect-sco-pe.mjs --source\n`);
  process.stdout.write(`  inspect-sco-pe.mjs --exports\n`);
  process.stdout.write(`  inspect-sco-pe.mjs --headers\n`);
  process.stdout.write(`  inspect-sco-pe.mjs --defaults\n`);
  process.stdout.write(`  inspect-sco-pe.mjs --docs\n\n`);
  process.stdout.write(`Set SCO_PE_ROOT to inspect a specific checkout/package.\n`);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const root = detectRoot();
if (!root) {
  fail("Could not find @lekoala/sco-pe. Run inside its repository/a consuming project or set SCO_PE_ROOT.");
  process.exit(1);
}

const pkgPath = path.join(root, "package.json");
const pkg = readJson(pkgPath);
const configPath = path.join(root, "src", "config.js");
const docsDir = path.join(root, "docs");

if (args.length === 0 || args[0] === "--source") {
  print({
    name: pkg.name,
    version: pkg.version,
    root,
    packageJson: pkgPath,
    readme: exists(path.join(root, "README.md")) ? path.join(root, "README.md") : null,
    config: exists(configPath) ? configPath : null,
    serverContract: exists(path.join(docsDir, "server-contract.md"))
      ? path.join(docsDir, "server-contract.md")
      : null,
  });
  process.exit(0);
}

if (args[0] === "--exports") {
  print({ version: pkg.version, exports: pkg.exports ?? {} });
  process.exit(0);
}

if (args[0] === "--docs") {
  const docs = exists(docsDir)
    ? fs.readdirSync(docsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
    : [];
  print({ version: pkg.version, docs });
  process.exit(0);
}

if (args[0] === "--headers" || args[0] === "--defaults") {
  if (!exists(configPath)) {
    fail(`Could not find src/config.js in ${root}`);
    process.exit(1);
  }

  const config = await import(pathToFileURL(configPath).href);

  if (args[0] === "--headers") {
    print({
      version: pkg.version,
      responseHeaders: config.DEFAULT_HEADERS ?? {},
      requestHeaders: config.DEFAULT_CONFIG?.requestHeaders ?? {},
    });
    process.exit(0);
  }

  const defaults = config.DEFAULT_CONFIG ?? {};
  print({
    version: pkg.version,
    defaults: {
      debug: defaults.debug,
      activeClass: defaults.activeClass,
      statusTarget: defaults.statusTarget,
      alertTarget: defaults.alertTarget,
      focus: defaults.focus,
      scroll: defaults.scroll,
      announce: defaults.announce,
      autosubmitDelay: defaults.autosubmitDelay,
      timeout: defaults.timeout,
      sync: defaults.sync,
      transition: defaults.transition,
      transitionTimeout: defaults.transitionTimeout,
      allowExternalAssets: defaults.allowExternalAssets,
      syncDocumentAttributes: defaults.syncDocumentAttributes,
      components: defaults.components,
    },
  });
  process.exit(0);
}

fail(`Unknown option: ${args[0]}`);
usage();
process.exit(1);
