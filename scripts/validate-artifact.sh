#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
wrangler_config="${SITES_PROJECT_ROOT}/dist/server/wrangler.json"

[[ -f "${worker}" ]] || {
  echo "Missing Cloudflare Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${wrangler_config}" ]] || {
  echo "Missing Cloudflare configuration: dist/server/wrangler.json" >&2
  exit 66
}

node --input-type=module - "${worker}" "${wrangler_config}" <<'NODE'
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [workerPath, wranglerConfigPath] = process.argv.slice(2);
const wranglerConfig = JSON.parse(await readFile(wranglerConfigPath, "utf8"));
if (!Array.isArray(wranglerConfig.d1_databases)) {
  throw new Error("dist/server/wrangler.json must define d1_databases");
}

const workerSource = await readFile(workerPath, "utf8");
if (/from\s+["']cloudflare:/.test(workerSource)) {
  const hasFetchHandler =
    /(?:var|const|let)\s+\w+\s*=\s*\{\s*async\s+fetch\s*\(/s.test(workerSource);
  const hasDefaultExport =
    /export\s*\{\s*\w+\s+as\s+default\s*\}/s.test(workerSource);

  if (!hasFetchHandler || !hasDefaultExport) {
    throw new Error(
      "dist/server/index.js must contain an ESM default Worker export with an async fetch handler",
    );
  }
  process.exit(0);
}

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
NODE

echo "Validated Cloudflare artifact: ESM Worker default.fetch and D1 configuration are present."
