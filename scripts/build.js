/** Build the browser bundles with Bun. */
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

async function bundle(naming, minify) {
  const result = await Bun.build({
    entrypoints: ["sco-pe.js"],
    outdir: "dist",
    naming,
    target: "browser",
    format: "esm",
    sourcemap: "linked",
    minify,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

await bundle("sco-pe.js", false);
await bundle("sco-pe.min.js", true);
