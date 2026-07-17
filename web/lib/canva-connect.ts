import "server-only";

import { uploadToCohesivityStorage } from "@/lib/cohesivity-storage";
import {
  basicAuthHeader,
  type OAuthTokens,
} from "@/lib/oauth-pkce";
import { runtimeEnv } from "@/lib/runtime-env";

const CANVA_API = "https://api.canva.com/rest/v1";
const USER_AGENT = "thumbnail-studio/1.0 (canva-connect)";

export type CanvaExportMode = "flat" | "template";

export function canvaConfigured(): boolean {
  return Boolean(runtimeEnv("CANVA_CLIENT_ID") && runtimeEnv("CANVA_CLIENT_SECRET"));
}

/** Manual Canva handoff works whenever we can host a public PNG URL. */
export function canvaExportAvailable(): boolean {
  return canvaConfigured() || Boolean(runtimeEnv("COH_APPLICATION_KEY"));
}

export function buildCanvaAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const scopes = [
    "asset:read",
    "asset:write",
    "design:content:write",
    "design:meta:read",
    "profile:read",
  ].join(" ");

  const params = new URLSearchParams({
    code_challenge: input.codeChallenge,
    code_challenge_method: "s256",
    scope: scopes,
    response_type: "code",
    client_id: input.clientId,
    state: input.state,
    redirect_uri: input.redirectUri,
  });

  return `https://www.canva.com/api/oauth/authorize?${params.toString()}`;
}

export async function exchangeCanvaCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });

  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(input.clientId, input.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Canva token exchange failed (${res.status})`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 14_400) * 1000,
    scope: data.scope,
  };
}

export async function refreshCanvaToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });

  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(input.clientId, input.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Canva token refresh failed (${res.status})`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || input.refreshToken,
    expiresAt: Date.now() + (data.expires_in || 14_400) * 1000,
    scope: data.scope,
  };
}

async function waitForUrlAssetUpload(accessToken: string, jobId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${CANVA_API}/url-asset-uploads/${jobId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      throw new Error(`Canva asset job lookup failed (${res.status})`);
    }

    const data = (await res.json()) as {
      job?: {
        status?: string;
        asset?: { id?: string };
        error?: { message?: string };
      };
    };

    if (data.job?.status === "success" && data.job.asset?.id) {
      return data.job.asset.id;
    }
    if (data.job?.status === "failed") {
      throw new Error(data.job.error?.message || "Canva asset upload failed");
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("Canva asset upload timed out");
}

export async function exportThumbnailToCanva(input: {
  accessToken: string;
  imageUrl: string;
  title: string;
  mode: CanvaExportMode;
}): Promise<{ designId: string; editUrl: string }> {
  const uploadRes = await fetch(`${CANVA_API}/url-asset-uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      name: input.title,
      url: input.imageUrl,
    }),
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new Error(`Canva asset upload start failed (${uploadRes.status}): ${text.slice(0, 200)}`);
  }

  const uploadData = (await uploadRes.json()) as { job?: { id?: string } };
  const jobId = uploadData.job?.id;
  if (!jobId) throw new Error("Canva asset upload did not return a job id");

  const assetId = await waitForUrlAssetUpload(input.accessToken, jobId);

  const designRes = await fetch(`${CANVA_API}/designs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      type: "type_and_asset",
      design_type: {
        type: "custom",
        width: 1280,
        height: 720,
      },
      asset_id: assetId,
      title:
        input.mode === "template"
          ? `${input.title} · Thumbnail Studio template`
          : `${input.title} · Thumbnail Studio`,
    }),
  });

  if (!designRes.ok) {
    const text = await designRes.text().catch(() => "");
    throw new Error(`Canva design create failed (${designRes.status}): ${text.slice(0, 200)}`);
  }

  const designData = (await designRes.json()) as {
    design?: { id?: string; urls?: { edit_url?: string } };
  };

  const designId = designData.design?.id;
  const editUrl = designData.design?.urls?.edit_url;
  if (!designId || !editUrl) {
    throw new Error("Canva design response missing edit URL");
  }

  return { designId, editUrl };
}

export async function uploadPngForExport(
  pngBytes: Buffer,
  filename: string
): Promise<{ path: string; url: string }> {
  const result = await uploadToCohesivityStorage(`exports/${filename}`, pngBytes, "image/png");
  return { path: result.path, url: result.url };
}
