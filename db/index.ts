import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type D1Binding = Parameters<typeof drizzle>[0];

export function getD1Binding(): D1Binding {
  const binding = (
    globalThis as typeof globalThis & {
      __KAESTLI_SITE_ENV__?: { DB?: D1Binding };
    }
  ).__KAESTLI_SITE_ENV__?.DB;
  if (!binding) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the DB binding before using the database."
    );
  }
  return binding;
}

export function getDb() {
  return drizzle(getD1Binding(), { schema });
}
