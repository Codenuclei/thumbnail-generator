import { createHash, randomBytes } from "crypto";

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createOAuthState(): string {
  return randomBytes(16).toString("base64url");
}

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
};

export type PkceSession = {
  verifier: string;
  state: string;
  provider: "canva" | "figma";
  redirectUri: string;
};

export function encodeCookieValue(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCookieValue<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function redirectUriFor(origin: string, provider: "canva" | "figma"): string {
  return `${origin.replace(/\/$/, "")}/api/export/${provider}/callback`;
}

export function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}
