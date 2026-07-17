import { cookies } from "next/headers";
import {
  decodeCookieValue,
  encodeCookieValue,
  type OAuthTokens,
  type PkceSession,
} from "@/lib/oauth-pkce";

const TOKEN_COOKIE = {
  canva: "ts_canva_tokens",
  figma: "ts_figma_tokens",
} as const;

const PKCE_COOKIE = {
  canva: "ts_canva_pkce",
  figma: "ts_figma_pkce",
} as const;

export async function savePkceSession(provider: "canva" | "figma", session: PkceSession): Promise<void> {
  const jar = await cookies();
  jar.set(PKCE_COOKIE[provider], encodeCookieValue(session), {
    httpOnly: true,
    // Only Secure on real HTTPS hosts — local `next start` is http://localhost.
    secure: process.env.COOKIE_SECURE === "1" || process.env.VERCEL === "1",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
}

export async function readPkceSession(provider: "canva" | "figma"): Promise<PkceSession | null> {
  const jar = await cookies();
  return decodeCookieValue<PkceSession>(jar.get(PKCE_COOKIE[provider])?.value);
}

export async function clearPkceSession(provider: "canva" | "figma"): Promise<void> {
  const jar = await cookies();
  jar.delete(PKCE_COOKIE[provider]);
}

export async function saveOAuthTokens(provider: "canva" | "figma", tokens: OAuthTokens): Promise<void> {
  const jar = await cookies();
  jar.set(TOKEN_COOKIE[provider], encodeCookieValue(tokens), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "1" || process.env.VERCEL === "1",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function readOAuthTokens(provider: "canva" | "figma"): Promise<OAuthTokens | null> {
  const jar = await cookies();
  return decodeCookieValue<OAuthTokens>(jar.get(TOKEN_COOKIE[provider])?.value);
}

export async function clearOAuthTokens(provider: "canva" | "figma"): Promise<void> {
  const jar = await cookies();
  jar.delete(TOKEN_COOKIE[provider]);
}

export function isTokenFresh(tokens: OAuthTokens | null): boolean {
  if (!tokens?.accessToken) return false;
  return Date.now() < tokens.expiresAt - 60_000;
}
