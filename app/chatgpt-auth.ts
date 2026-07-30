import { createRemoteJWKSet, jwtVerify } from "jose";
import { headers } from "next/headers";

export type AdminUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const CLOUDFLARE_ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

type RuntimeEnv = {
  ADMIN_EMAILS?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  CLOUDFLARE_ACCESS_ISSUER?: string;
};

let cachedAccessIssuer = "";
let cachedAccessJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function runtimeEnv(): RuntimeEnv {
  return (
    (globalThis as typeof globalThis & {
      __KAESTLI_SITE_ENV__?: RuntimeEnv;
    }).__KAESTLI_SITE_ENV__ ?? {}
  );
}

async function getCloudflareAccessUser(): Promise<AdminUser | null> {
  const requestHeaders = await headers();
  const runtime = runtimeEnv();
  const issuer = String(runtime.CLOUDFLARE_ACCESS_ISSUER ?? "").replace(
    /\/+$/,
    "",
  );
  const audience = String(runtime.CLOUDFLARE_ACCESS_AUD ?? "").trim();
  const token = requestHeaders.get(CLOUDFLARE_ACCESS_JWT_HEADER);
  if (!issuer || !audience || !token) return null;

  try {
    if (!cachedAccessJwks || cachedAccessIssuer !== issuer) {
      cachedAccessIssuer = issuer;
      cachedAccessJwks = createRemoteJWKSet(
        new URL(`${issuer}/cdn-cgi/access/certs`),
      );
    }
    const { payload } = await jwtVerify(token, cachedAccessJwks, {
      issuer,
      audience: audience
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
    const accessEmail =
      typeof payload.email === "string" ? payload.email.trim() : "";
    if (!accessEmail) return null;
    return {
      displayName: accessEmail,
      email: accessEmail,
      fullName: null,
    };
  } catch {
    return null;
  }
}

export async function getAdminUser(): Promise<AdminUser | null> {
  const user = await getCloudflareAccessUser();
  if (!user) return null;

  const configuredEmails = String(
    runtimeEnv().ADMIN_EMAILS ?? "",
  )
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configuredEmails.includes(user.email.trim().toLowerCase())
    ? user
    : null;
}
