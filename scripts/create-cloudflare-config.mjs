import { readFile, writeFile } from "node:fs/promises";

const required = [
  "CLOUDFLARE_D1_DATABASE_ID",
  "CLOUDFLARE_D1_DATABASE_NAME",
];
const missing = required.filter(
  (name) => !String(process.env[name] ?? "").trim(),
);
if (missing.length) {
  throw new Error(
    `Fehlende Cloudflare-Konfiguration: ${missing.join(", ")}`,
  );
}

const source = JSON.parse(
  await readFile("dist/server/wrangler.json", "utf8"),
);
const variable = (name) => String(process.env[name] ?? "").trim();

source.name =
  variable("CLOUDFLARE_WORKER_NAME") || "kaestli-variantenvergleich";
source.main = "dist/server/index.js";
source.assets = {
  ...(source.assets ?? {}),
  binding: "ASSETS",
  directory: "dist/client",
};
source.workers_dev = true;
source.d1_databases = [
  {
    binding: "DB",
    database_name: variable("CLOUDFLARE_D1_DATABASE_NAME"),
    database_id: variable("CLOUDFLARE_D1_DATABASE_ID"),
    migrations_dir: "drizzle",
  },
];
source.vars = Object.fromEntries(
  [
    ["ADMIN_EMAILS", variable("ADMIN_EMAILS")],
    ["CLOUDFLARE_ACCESS_AUD", variable("CLOUDFLARE_ACCESS_AUD")],
    ["CLOUDFLARE_ACCESS_ISSUER", variable("CLOUDFLARE_ACCESS_ISSUER")],
  ].filter(([, value]) => value),
);

await writeFile(
  ".wrangler.deploy.jsonc",
  `${JSON.stringify(source, null, 2)}\n`,
);
console.log("Cloudflare-Konfiguration erstellt.");
