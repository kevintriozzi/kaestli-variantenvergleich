import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("packages development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  const workerSource = await readFile(workerUrl, "utf8");
  assert.match(workerSource, /["']codex-preview["']\s*:\s*["']development["']/);
});

test("uses the square Kästli logo for browser icons", async () => {
  const layoutSource = await readFile(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  const pngUrl = new URL("../public/kaestli-favicon.png", import.meta.url);
  const icoUrl = new URL("../public/favicon.ico", import.meta.url);
  const [png, ico, pngStats, icoStats] = await Promise.all([
    readFile(pngUrl),
    readFile(icoUrl),
    stat(pngUrl),
    stat(icoUrl),
  ]);

  assert.match(layoutSource, /\/kaestli-favicon\.png/);
  assert.match(layoutSource, /\/favicon\.ico/);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0]);
  assert.ok(pngStats.size > 0);
  assert.ok(icoStats.size > 0);
});

test("keeps public calculation separate from authenticated admin writes", async () => {
  const [pageSource, adminPageSource, appSource, apiSource, authSource] =
    await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/calculator-app.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/api/catalog/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(pageSource, /getAdminUser/);
  assert.match(pageSource, /isAdmin=\{false\}/);
  assert.match(adminPageSource, /getAdminUser/);
  assert.match(adminPageSource, /initialView="admin"/);
  assert.match(appSource, /isAdmin \? \(/);
  assert.match(appSource, /adminSignInPath/);
  assert.match(appSource, /\/api\/admin\/catalog/);
  assert.match(apiSource, /if \(!\(await getAdminUser\(\)\)\)/);
  assert.match(authSource, /ADMIN_EMAILS/);
  assert.match(authSource, /cf-access-jwt-assertion/);
  assert.doesNotMatch(authSource, /oai-authenticated-user-email/);
});
