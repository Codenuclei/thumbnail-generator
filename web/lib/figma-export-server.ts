import "server-only";

import { basicAuthHeader, type OAuthTokens } from "@/lib/oauth-pkce";
import { runtimeEnv } from "@/lib/runtime-env";

const FIGMA_TOKEN_URL = "https://api.figma.com/v1/oauth/token";
const USER_AGENT = "thumbnail-studio/1.0 (figma-export)";

export function figmaConfigured(): boolean {
  // Layer/flat handoff only needs Cohesivity object storage.
  // OAuth / personal access token is optional enrichment.
  return Boolean(
    runtimeEnv("COH_APPLICATION_KEY") ||
      (runtimeEnv("FIGMA_CLIENT_ID") && runtimeEnv("FIGMA_CLIENT_SECRET")) ||
      runtimeEnv("FIGMA_ACCESS_TOKEN")
  );
}

export function figmaOAuthConfigured(): boolean {
  return Boolean(runtimeEnv("FIGMA_CLIENT_ID") && runtimeEnv("FIGMA_CLIENT_SECRET"));
}

export function buildFigmaAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const scopes = ["file_content:read", "file_metadata:read", "current_user:read"].join(",");
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: scopes,
    state: input.state,
    response_type: "code",
  });
  return `https://www.figma.com/oauth?${params.toString()}`;
}

export async function exchangeFigmaCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });

  const res = await fetch(FIGMA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(input.clientId, input.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Figma token exchange failed (${res.status})`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

export async function getFigmaUser(accessToken: string): Promise<{ id: string; email: string }> {
  const res = await fetch("https://api.figma.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) throw new Error(`Figma profile lookup failed (${res.status})`);
  const data = (await res.json()) as { id?: string; email?: string };
  return { id: data.id || "", email: data.email || "" };
}

export function serverFigmaAccessToken(): string | null {
  return runtimeEnv("FIGMA_ACCESS_TOKEN") || null;
}
